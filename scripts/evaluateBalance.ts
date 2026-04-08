import { readFile } from 'node:fs/promises';
import { evaluateBalanceRequest, normalizeEvaluationRequest } from '../src/balance/evaluate.js';

function parseArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function loadPayload(): Promise<unknown> {
  const inputPath = parseArgValue('--input');
  const raw = inputPath
    ? await readFile(inputPath, 'utf8')
    : await readStdin();

  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

async function main(): Promise<void> {
  try {
    const payload = await loadPayload();
    const request = normalizeEvaluationRequest(payload);

    const seedsArg = parseArgValue('--seeds');
    if (seedsArg) {
      request.seeds = seedsArg.split(',').map((seed) => Number(seed.trim()));
    }

    const turnsArg = parseArgValue('--turns');
    if (turnsArg) {
      request.maxTurns = Number(turnsArg);
    }

    if (process.argv.includes('--random')) {
      request.mapMode = 'randomClimateBands';
    }
    if (process.argv.includes('--stratified')) {
      request.stratified = true;
    }

    const result = evaluateBalanceRequest(request);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

await main();
