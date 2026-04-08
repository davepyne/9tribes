import { readFile } from 'node:fs/promises';
import { evaluateBalanceRequest, normalizeEvaluationRequest } from '../src/balance/evaluate.js';

const VALIDATION_SEEDS = [
  11, 23, 37, 41, 59, 73, 89, 97, 101, 131,
  149, 167, 181, 193, 211, 227, 239, 251, 269, 283,
  307, 331, 347, 359, 373, 389, 401, 419, 433, 449,
] as const;

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

function proportionCI(wins: number, total: number): { rate: number; low: number; high: number } {
  const rate = total === 0 ? 0 : wins / total;
  const margin = total === 0 ? 0 : 1.96 * Math.sqrt((rate * (1 - rate)) / total);
  return {
    rate: Number(rate.toFixed(4)),
    low: Number(Math.max(0, rate - margin).toFixed(4)),
    high: Number(Math.min(1, rate + margin).toFixed(4)),
  };
}

async function main(): Promise<void> {
  try {
    const payload = await loadPayload();
    const request = normalizeEvaluationRequest(payload);
    request.seeds = parseArgValue('--seeds')
      ? parseArgValue('--seeds')!.split(',').map((seed) => Number(seed.trim()))
      : [...VALIDATION_SEEDS];

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
    const factionConfidence = Object.fromEntries(
      Object.entries(result.summary.factions).map(([factionId, faction]) => [
        factionId,
        {
          wins: faction.wins,
          winRate: proportionCI(faction.wins, result.summary.totalSeeds),
          avgLivingUnits: faction.avgLivingUnits,
          avgCities: faction.avgCities,
          avgVillages: faction.avgVillages,
        },
      ])
    );

    const unresolved = proportionCI(result.summary.unresolvedGames, result.summary.totalSeeds);
    console.log(JSON.stringify({
      validationSeeds: result.seeds,
      maxTurns: result.maxTurns,
      mapMode: result.mapMode,
      objective: result.objective,
      unresolvedRate: unresolved,
      factions: factionConfidence,
      summary: result.summary,
    }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

await main();
