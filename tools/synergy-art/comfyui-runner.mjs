#!/usr/bin/env node
/**
 * Drive a local ComfyUI server through every prompt in prompts.json and
 * save outputs directly into web/public/assets/synergy-cards/.
 *
 * Setup:
 *   1. Open ComfyUI, build the workflow you want (Flux loader → KSampler →
 *      Save Image), test once, then File → "Save (API Format)" to export
 *      the API JSON. Save it next to this file as `workflow.json`.
 *      The runner replaces two placeholders inside that JSON:
 *        - any node text matching {{PROMPT}} → the synergy prompt
 *        - any node text matching {{NEGATIVE}} → the negative prompt
 *      (You can rename either by editing PROMPT_MARKER / NEGATIVE_MARKER below.)
 *
 *   2. Make sure the workflow's SaveImage node has filename_prefix: "syn_card"
 *      (or anything stable) — we don't rely on the server's filename, we
 *      pull bytes from the /history endpoint and save them ourselves.
 *
 *   3. Run:
 *        node tools/synergy-art/comfyui-runner.mjs --url http://127.0.0.1:8188
 *      Add --only pair OR --only triple to filter.
 *      Add --skip-existing (default true) to resume after interruption.
 *      Add --limit 5 to test on a small slice first.
 *
 * Notes:
 *   - This script intentionally has no external deps. Node 20+ has fetch.
 *   - If your workflow expects different placeholder syntax, edit the
 *     applyPlaceholders function below.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const PROMPT_MARKER = '{{PROMPT}}';
const NEGATIVE_MARKER = '{{NEGATIVE}}';

const ART_OUT = path.join(ROOT, 'web', 'public', 'assets', 'synergy-cards');

function parseArgs() {
  const args = { url: 'http://127.0.0.1:8188', only: null, skipExisting: true, limit: Infinity };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--only') args.only = argv[++i];   // 'pair' | 'triple'
    else if (a === '--skip-existing') args.skipExisting = true;
    else if (a === '--no-skip-existing') args.skipExisting = false;
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
  }
  return args;
}

function applyPlaceholders(workflow, prompt, negative) {
  const json = JSON.stringify(workflow);
  const replaced = json
    .replace(new RegExp(escapeRegex(PROMPT_MARKER), 'g'), escapeJson(prompt))
    .replace(new RegExp(escapeRegex(NEGATIVE_MARKER), 'g'), escapeJson(negative));
  return JSON.parse(replaced);
}

function escapeRegex(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function escapeJson(s) {
  return JSON.stringify(s).slice(1, -1);  // strip outer quotes
}

async function queuePrompt(serverUrl, workflow) {
  const res = await fetch(`${serverUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!res.ok) throw new Error(`queue failed: ${res.status} ${await res.text()}`);
  return res.json();  // { prompt_id, number, node_errors }
}

async function pollHistory(serverUrl, promptId) {
  for (let i = 0; i < 240; i++) {
    const res = await fetch(`${serverUrl}/history/${promptId}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data[promptId] && data[promptId].outputs) {
        return data[promptId];
      }
    }
    await sleep(2000);
  }
  throw new Error(`timed out waiting for prompt ${promptId}`);
}

async function downloadImage(serverUrl, imageMeta, destPath) {
  const params = new URLSearchParams({
    filename: imageMeta.filename,
    type: imageMeta.type ?? 'output',
    subfolder: imageMeta.subfolder ?? '',
  });
  const res = await fetch(`${serverUrl}/view?${params}`);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
}

async function main() {
  const args = parseArgs();
  const manifestPath = path.join(__dirname, 'prompts.json');
  const workflowPath = path.join(__dirname, 'workflow.json');

  if (!fs.existsSync(manifestPath)) {
    console.error('prompts.json not found. Run: node scripts/generateSynergyArtPrompts.mjs');
    process.exit(1);
  }
  if (!fs.existsSync(workflowPath)) {
    console.error(`workflow.json not found at ${workflowPath}`);
    console.error('Export an API-format workflow from ComfyUI and save it here.');
    console.error(`Make sure the workflow has ${PROMPT_MARKER} and ${NEGATIVE_MARKER}`);
    console.error('substrings somewhere in CLIPTextEncode (or equivalent) text fields.');
    process.exit(1);
  }

  const { entries } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const baseWorkflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

  const filtered = entries
    .filter((e) => !args.only || e.kind === args.only)
    .slice(0, args.limit);

  console.log(`Generating ${filtered.length} images via ${args.url}`);

  let done = 0;
  for (const entry of filtered) {
    const destPath = path.join(ART_OUT, entry.filename);
    if (args.skipExisting && fs.existsSync(destPath)) {
      console.log(`  skip (exists): ${entry.filename}`);
      done++;
      continue;
    }

    const workflow = applyPlaceholders(baseWorkflow, entry.prompt, entry.negative_prompt);
    try {
      const queued = await queuePrompt(args.url, workflow);
      const result = await pollHistory(args.url, queued.prompt_id);
      const images = Object.values(result.outputs).flatMap((o) => o.images ?? []);
      if (images.length === 0) throw new Error('no images returned by workflow');
      await downloadImage(args.url, images[0], destPath);
      done++;
      console.log(`  [${done}/${filtered.length}] ${entry.filename}`);
    } catch (err) {
      console.error(`  FAIL ${entry.filename}: ${err.message}`);
    }
  }

  console.log(`\nDone. ${done}/${filtered.length} images present.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
