#!/usr/bin/env node
/**
 * Verify every synergy and emergent rule has the fields the SynergyCard
 * UI expects, and that the backend / frontend duplicates are in sync.
 *
 * Exits non-zero on any mismatch — wire into CI to prevent content drift.
 *
 * Checks:
 *   1. Both src/content/base/ and web/src/data/ exist.
 *   2. Same number of pairs / rules in both copies.
 *   3. Every pair has: id, name, domains[2], description, friendlyFlavor, enemyFlavor.
 *   4. Every rule has: id, name, effect.description, friendlyFlavor, enemyFlavor.
 *   5. Backend and frontend copies match by id and content.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const FILES = {
  pairsBackend:   path.join(ROOT, 'src', 'content', 'base', 'pair-synergies.json'),
  pairsFrontend:  path.join(ROOT, 'web', 'src', 'data', 'pair-synergies.json'),
  rulesBackend:   path.join(ROOT, 'src', 'content', 'base', 'emergent-rules.json'),
  rulesFrontend:  path.join(ROOT, 'web', 'src', 'data', 'emergent-rules.json'),
};

const errors = [];

function load(p, key) {
  if (!fs.existsSync(p)) {
    errors.push(`MISSING FILE: ${path.relative(ROOT, p)}`);
    return [];
  }
  const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
  return obj[key] ?? [];
}

function checkPair(syn, where) {
  const required = ['id', 'name', 'description', 'friendlyFlavor', 'enemyFlavor'];
  for (const field of required) {
    if (typeof syn[field] !== 'string' || syn[field].trim() === '') {
      errors.push(`[${where}] pair ${syn.id ?? '?'}: missing/empty "${field}"`);
    }
  }
  if (!Array.isArray(syn.domains) || syn.domains.length < 2) {
    errors.push(`[${where}] pair ${syn.id ?? '?'}: needs domains[] of length >= 2`);
  }
}

function checkRule(rule, where) {
  for (const field of ['id', 'name', 'friendlyFlavor', 'enemyFlavor']) {
    if (typeof rule[field] !== 'string' || rule[field].trim() === '') {
      errors.push(`[${where}] rule ${rule.id ?? '?'}: missing/empty "${field}"`);
    }
  }
  if (!rule.effect || typeof rule.effect.description !== 'string' || rule.effect.description.trim() === '') {
    errors.push(`[${where}] rule ${rule.id ?? '?'}: missing/empty effect.description`);
  }
}

function compareSets(a, b, kind) {
  if (a.length !== b.length) {
    errors.push(`${kind} count mismatch: backend ${a.length} vs frontend ${b.length}`);
  }
  const am = new Map(a.map((e) => [e.id, e]));
  const bm = new Map(b.map((e) => [e.id, e]));
  for (const id of am.keys()) {
    if (!bm.has(id)) errors.push(`${kind} ${id}: exists in backend, missing in frontend`);
  }
  for (const id of bm.keys()) {
    if (!am.has(id)) errors.push(`${kind} ${id}: exists in frontend, missing in backend`);
  }
  for (const [id, ae] of am) {
    const be = bm.get(id);
    if (!be) continue;
    for (const field of ['name', 'friendlyFlavor', 'enemyFlavor']) {
      if (ae[field] !== be[field]) {
        errors.push(`${kind} ${id}: backend.${field} != frontend.${field}`);
      }
    }
  }
}

const pairsB = load(FILES.pairsBackend, 'pairSynergies');
const pairsF = load(FILES.pairsFrontend, 'pairSynergies');
const rulesB = load(FILES.rulesBackend, 'rules');
const rulesF = load(FILES.rulesFrontend, 'rules');

for (const p of pairsB) checkPair(p, 'backend');
for (const p of pairsF) checkPair(p, 'frontend');
for (const r of rulesB) checkRule(r, 'backend');
for (const r of rulesF) checkRule(r, 'frontend');

compareSets(pairsB, pairsF, 'pair');
compareSets(rulesB, rulesF, 'rule');

if (errors.length > 0) {
  console.error('Synergy coverage check FAILED:\n');
  for (const e of errors) console.error('  - ' + e);
  console.error(`\n${errors.length} error(s).`);
  process.exit(1);
}

console.log(`Synergy coverage OK: ${pairsB.length} pairs, ${rulesB.length} rules. Backend == frontend.`);
