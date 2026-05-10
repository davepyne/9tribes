#!/usr/bin/env node
/**
 * Drive a local ComfyUI server through every prompt in prompts.json and
 * save outputs directly into web/public/assets/synergy-cards/.
 *
 * Queues all prompts upfront so ComfyUI keeps models loaded between jobs,
 * then polls for results and downloads as each completes.
 *
 * Run:
 *   node tools/synergy-art/comfyui-runner.mjs --url http://127.0.0.1:8188
 *   --only solo|pair|triple   filter by kind
 *   --no-skip-existing        overwrite existing files
 *   --limit N                 only generate N images
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
    else if (a === '--only') args.only = argv[++i];
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
  return JSON.stringify(s).slice(1, -1);
}

async function queuePrompt(serverUrl, workflow) {
  const res = await fetch(`${serverUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!res.ok) throw new Error(`queue failed: ${res.status} ${await res.text()}`);
  return res.json();
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
    process.exit(1);
  }

  const { entries } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const baseWorkflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

  const filtered = entries
    .filter((e) => !args.only || e.kind === args.only)
    .slice(0, args.limit);

  const todo = filtered.filter((entry) => {
    if (!args.skipExisting) return true;
    const destPath = path.join(ART_OUT, entry.filename);
    if (fs.existsSync(destPath)) {
      console.log(`  skip (exists): ${entry.filename}`);
      return false;
    }
    return true;
  });

  const skipped = filtered.length - todo.length;
  console.log(`Generating ${todo.length} images via ${args.url}${skipped ? ` (${skipped} skipped)` : ''}`);

  if (todo.length === 0) {
    console.log('\nDone. 0 images to generate.');
    return;
  }

  // Queue all prompts upfront so ComfyUI keeps models loaded between jobs.
  const queued = [];
  for (const entry of todo) {
    const workflow = applyPlaceholders(baseWorkflow, entry.prompt, entry.negative_prompt);
    try {
      const result = await queuePrompt(args.url, workflow);
      queued.push({ entry, promptId: result.prompt_id });
    } catch (err) {
      console.error(`  FAIL (queue) ${entry.filename}: ${err.message}`);
    }
  }

  console.log(`  Queued ${queued.length} prompts. Waiting for results...`);

  // Poll and download as each completes.
  let done = 0;
  const remaining = new Map(queued.map((q) => [q.promptId, q.entry]));

  while (remaining.size > 0) {
    await sleep(3000);

    const res = await fetch(`${args.url}/history`);
    if (!res.ok) continue;
    const history = await res.json();

    for (const [promptId, entry] of remaining) {
      const record = history[promptId];
      if (!record?.outputs) continue;

      const destPath = path.join(ART_OUT, entry.filename);
      try {
        const images = Object.values(record.outputs).flatMap((o) => o.images ?? []);
        if (images.length === 0) throw new Error('no images returned');
        await downloadImage(args.url, images[0], destPath);
        done++;
        console.log(`  [${done}/${queued.length}] ${entry.filename}`);
      } catch (err) {
        done++;
        console.error(`  FAIL ${entry.filename}: ${err.message}`);
      }
      remaining.delete(promptId);
    }
  }

  console.log(`\nDone. ${done}/${queued.length} images generated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
