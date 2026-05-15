#!/usr/bin/env node
// ============================================================================
// Synergy Coverage Audit — Phase 1 of synergy-primitives cleanup plan
// ============================================================================
//
// Enumerates StatName / FlagName / VerbName entries (the contract surface of
// SynergyCombatResult) and classifies each as live/dead/vestigial/orphan, and
// reports trigger/target/scaling usage.
//
// After Phase 3, SynergyCombatResult is a generic container (Map<StatName,
// number>, Set<FlagName>, etc.); the audit operates on the string-literal
// unions rather than interface fields.
//
// Usage: node --import=tsx scripts/auditSynergyCoverage.ts
//
// Output:
//   .slim/synergy-coverage.json — machine-readable classification table
//   stdout                       — human-readable summary
// ============================================================================

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Classification = 'live' | 'dead' | 'vestigial' | 'orphan';
type Kind = 'stat' | 'flag' | 'verb' | 'data';

export interface FieldClassification {
  field: string;
  kind: Kind;
  writtenByContent: boolean;
  dispatcherWriteBranch: boolean;
  readByConsumer: boolean;
  classification: Classification;
}

export interface TriggerTargetUsage {
  synergyId: string;
  primitiveKind: string;
  field: 'trigger' | 'target' | 'scaling';
  value: unknown;
}

export interface InertSynergy {
  id: string;
  kind: 'pair' | 'emergent';
  writtenFields: string[];
}

export interface AuditResult {
  fields: FieldClassification[];
  counts: Record<Classification, number>;
  triggerTargetScaling: TriggerTargetUsage[];
  unreadFieldViolations: UnreadFieldViolation[];
  inertSynergies: InertSynergy[];
}

// ---------------------------------------------------------------------------
// Excluded paths for consumer-read checks
// ---------------------------------------------------------------------------
//
// These files implement the dispatch pipeline itself; their references to
// stat/flag/verb names are writes (or mechanical re-exports), not consumer
// reads.
const EXCLUDED_SUFFIXES = [
  '/systems/synergyTypes.ts',
  '/systems/synergyEffects.ts',
  '/systems/synergyPrimitives.ts',
  '/systems/primitiveDispatcher.ts',
  '/systems/labeling.ts',
];

// ---------------------------------------------------------------------------
// 1. Parse string-literal unions (StatName, FlagName, VerbName)
// ---------------------------------------------------------------------------

function parseStringUnion(filePath: string, typeName: string): string[] {
  const source = fs.readFileSync(filePath, 'utf-8');
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const values: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName) {
      collectLiterals(node.type);
    }
    ts.forEachChild(node, visit);
  }

  function collectLiterals(node: ts.TypeNode) {
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) {
      values.push(node.literal.text);
    } else if (ts.isUnionTypeNode(node)) {
      for (const t of node.types) collectLiterals(t);
    }
  }

  ts.forEachChild(sf, visit);
  return values;
}

// ---------------------------------------------------------------------------
// 2. Map primitive → result keys it writes (mirrors primitiveDispatcher.ts)
// ---------------------------------------------------------------------------

function primitiveToResultFields(p: Record<string, unknown>): string[] {
  switch (p.kind) {
    case 'statMod':
      return typeof p.stat === 'string' ? [p.stat] : [];
    case 'setFlag':
      return typeof p.flag === 'string' ? [p.flag] : [];
    case 'applyStatus':
      switch (p.status) {
        case 'poison': return ['poisonStacks'];
        case 'stun': return ['stunDuration'];
        case 'frostbite': return [];
        case 'armorBroken': return ['armorPiercing'];
        case 'stealth':
          return p.duration === 'permanent'
            ? ['emergentPermanentStealthTerrains']
            : [];
        default: return [];
      }
    case 'knockback': {
      const f = ['knockbackDistance'];
      if (p.collisionDamage != null) f.push('formationPinballCollisionDamage');
      if (p.collisionStun != null) f.push('stunDuration');
      return f;
    }
    case 'heal':
      switch (p.mode) {
        case 'flat': return ['synergyFlatHeal'];
        case 'percentMaxHp': return ['synergyPercentHealMaxHp'];
        default: return [];
      }
    case 'capture': {
      const f: string[] = [];
      if (p.chanceBonus != null) {
        f.push('chargeCaptureChance', 'retreatCaptureChance', 'stealthCaptureBonus', 'navalCaptureBonus');
      }
      if (p.hpThreshold != null) f.push('emergentCaptureBelowHpPercent');
      return f;
    }
    case 'preventAction':
      switch (p.action) {
        case 'displacement': return ['antiDisplacement'];
        case 'instantKill': return ['emergentUndying'];
        case 'zoc': return ['emergentIgnoreZoc'];
        case 'captureEscape': return ['captureEscapePrevented'];
        case 'retreatThroughImpassable': return ['ghostPassActive'];
        default: return [];
      }
    case 'spawnOnMap':
      switch (p.effectType) {
        case 'poisonTrap': return ['poisonTrapPositions'];
        case 'poisonCloud': return ['poisonTrapPositions', 'emergentPoisonCloudPreventsHealing'];
        case 'sandstorm': {
          const fields = (p.fields as Record<string, unknown>) ?? {};
          return fields.damage != null ? ['sandstormDamage'] : [];
        }
        case 'contamination': return ['contaminateActive'];
        default: return [];
      }
    case 'grantVerb': {
      const verb = p.verb as string;
      const f: string[] = [verb];  // verb itself is always added to result.verbs
      switch (verb) {
        case 'positionSwap': f.push('positionSwapAvailable'); break;
      }
      return f;
    }
    case 'instantKill':
      return ['instantKill'];
    case 'projectAura':
      return walkEffects((p.effects as Record<string, unknown>[]) ?? []);
    case 'modeSelect': {
      const f: string[] = [];
      const modes = (p.modes as Record<string, Record<string, unknown>[]>) ?? {};
      for (const modeEffects of Object.values(modes)) {
        f.push(...walkEffects(modeEffects));
      }
      return f;
    }
    default:
      return [];
  }
}

function walkEffects(effects: Record<string, unknown>[]): string[] {
  const out: string[] = [];
  for (const e of effects) out.push(...primitiveToResultFields(e));
  return out;
}

// ---------------------------------------------------------------------------
// 3. Walk content data — collect written fields + trigger/target/scaling
// ---------------------------------------------------------------------------

interface ContentWalkResult {
  writtenFields: Set<string>;
  ttsUsages: TriggerTargetUsage[];
}

function walkContent(
  entries: readonly { id?: string; effects: Record<string, unknown>[] }[],
): ContentWalkResult {
  const writtenFields = new Set<string>();
  const ttsUsages: TriggerTargetUsage[] = [];

  function walkPrimitive(p: Record<string, unknown>, synergyId: string) {
    for (const f of primitiveToResultFields(p)) writtenFields.add(f);

    if (p.trigger !== undefined) {
      ttsUsages.push({ synergyId, primitiveKind: String(p.kind), field: 'trigger', value: p.trigger });
    }
    if (p.target !== undefined) {
      ttsUsages.push({ synergyId, primitiveKind: String(p.kind), field: 'target', value: p.target });
    }
    if (p.scaling !== undefined) {
      ttsUsages.push({ synergyId, primitiveKind: String(p.kind), field: 'scaling', value: p.scaling });
    }

    if (p.kind === 'projectAura') {
      for (const inner of ((p.effects as Record<string, unknown>[]) ?? [])) walkPrimitive(inner, synergyId);
    }
    if (p.kind === 'modeSelect') {
      const modes = (p.modes as Record<string, Record<string, unknown>[]>) ?? {};
      for (const modeEffects of Object.values(modes)) {
        for (const inner of modeEffects) walkPrimitive(inner, synergyId);
      }
    }
  }

  for (const entry of entries) {
    const id = entry.id ?? '<unknown>';
    for (const p of entry.effects) walkPrimitive(p, id);
  }

  return { writtenFields, ttsUsages };
}

// ---------------------------------------------------------------------------
// 3b. Per-synergy inert detection
// ---------------------------------------------------------------------------

interface SynergyEntry {
  id?: string;
  effects: Record<string, unknown>[];
}

function getSynergyWrittenFields(entry: SynergyEntry): string[] {
  return walkEffects(entry.effects);
}

function findInertSynergies(
  entries: SynergyEntry[],
  kind: 'pair' | 'emergent',
  liveFields: Set<string>,
): InertSynergy[] {
  const inert: InertSynergy[] = [];
  for (const entry of entries) {
    const written = getSynergyWrittenFields(entry);
    if (written.length === 0) continue;
    const hasLive = written.some(f => liveFields.has(f));
    if (!hasLive) {
      inert.push({ id: entry.id ?? '<unknown>', kind, writtenFields: written });
    }
  }
  return inert;
}

// ---------------------------------------------------------------------------
// 4. Consumer-read check
// ---------------------------------------------------------------------------
//
// After the Phase 3 collapse, consumers read via the helper API:
//   result.getStat('name')   — for stats
//   result.hasFlag('name')   — for flags
//   result.hasVerb('name')   — for verbs
//   result.data.get('name')  — for misc data lists
//   result.getList('name')   — alternative for string lists
// The audit looks for these patterns rather than direct field access.

function getAllTsFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      getAllTsFiles(full, files);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

function isExcluded(filePath: string): boolean {
  return EXCLUDED_SUFFIXES.some(suf => filePath.endsWith(suf));
}

function buildConsumerReadMap(fieldNames: string[], tsFiles: string[]): Map<string, boolean> {
  const result = new Map<string, boolean>();
  const fileContents = new Map<string, string>();
  for (const f of tsFiles) {
    if (isExcluded(f)) continue;
    fileContents.set(f, fs.readFileSync(f, 'utf-8'));
  }

  for (const field of fieldNames) {
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match: getStat('name') | hasFlag('name') | hasVerb('name') | data.get('name') | getList('name')
    // Also accept double-quoted forms and factionHasEmergentFlag(..., 'name') helper calls.
    const re = new RegExp(
      `(getStat|hasFlag|hasVerb|getList)\\(\\s*['"\`]${escaped}['"\`]`
      + `|data\\.get\\(\\s*['"\`]${escaped}['"\`]`
      + `|factionHasEmergentFlag\\([^,]+,\\s*['"\`]${escaped}['"\`]`,
    );
    let found = false;
    for (const [, content] of fileContents) {
      if (re.test(content)) { found = true; break; }
    }
    result.set(field, found);
  }
  return result;
}

// ---------------------------------------------------------------------------
// 5. Declared-but-unread primitive field check (Phase 6)
// ---------------------------------------------------------------------------

// The set of optional fields that every primitive may carry via PrimitiveBase
// or per-kind interfaces. The dispatcher must actually read (destructure) each
// declared field at runtime; otherwise it is silently dropped, violating
// Invariant 2.
//
// This is a static allowlist that maps each primitive kind to the optional
// fields its dispatcher function reads. If a new optional field is added to an
// interface, it must appear here or the audit will flag it.

interface FieldReadCheck {
  kind: string;
  optionalFields: string[];
}

const DISPATCHER_READS: FieldReadCheck[] = [
  // PrimitiveBase fields — condition read by all dispatchers
  { kind: 'statMod',        optionalFields: ['condition'] },
  { kind: 'setFlag',        optionalFields: ['condition'] },
  { kind: 'applyStatus',    optionalFields: ['condition', 'stacks', 'duration', 'fields'] },
  { kind: 'knockback',      optionalFields: ['condition', 'collisionDamage', 'collisionStun', 'extendMultiplier'] },
  { kind: 'heal',           optionalFields: ['condition'] },
  { kind: 'capture',        optionalFields: ['condition', 'chanceBonus', 'hpThreshold'] },
  { kind: 'preventAction',  optionalFields: ['condition'] },
  { kind: 'spawnOnMap',     optionalFields: ['condition', 'radius', 'duration', 'fields'] },
  { kind: 'grantVerb',      optionalFields: ['condition'] },
  { kind: 'instantKill',    optionalFields: ['condition'] },
  { kind: 'projectAura',    optionalFields: ['condition'] },
  { kind: 'modeSelect',     optionalFields: ['condition'] },
];

export interface UnreadFieldViolation {
  kind: string;
  field: string;
}

export function checkDeclaredFieldsRead(): UnreadFieldViolation[] {
  const dispatcherSource = fs.readFileSync(
    path.join(SRC, 'systems', 'primitiveDispatcher.ts'), 'utf-8',
  );
  const violations: UnreadFieldViolation[] = [];

  for (const { kind, optionalFields } of DISPATCHER_READS) {
    // Find the dispatch function for this kind, e.g. dispatchStatMod
    const funcName = `dispatch${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
    // Extract the function body roughly: from funcName to the next function declaration
    const funcStartRe = new RegExp(`function ${funcName}\\b`);
    const funcStartMatch = funcStartRe.exec(dispatcherSource);
    if (!funcStartMatch) {
      // Kind not found in dispatcher — skip (should not happen)
      continue;
    }
    const funcStartIdx = funcStartMatch.index;
    // Find the next top-level function declaration after this one
    const nextFuncRe = /\nfunction\s+\w+/g;
    nextFuncRe.lastIndex = funcStartIdx + 1;
    const nextFuncMatch = nextFuncRe.exec(dispatcherSource);
    const funcEndIdx = nextFuncMatch ? nextFuncMatch.index : dispatcherSource.length;
    const funcBody = dispatcherSource.substring(funcStartIdx, funcEndIdx);

    for (const field of optionalFields) {
      // Check if the field is read: p.<field> or <param>.<field>
      // The dispatcher functions use `p` as the parameter name
      const fieldReadRe = new RegExp(`\\bp\\.${field}\\b`);
      if (!fieldReadRe.test(funcBody)) {
        violations.push({ kind, field });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// 6. Parse content data statically (TS Compiler API)
// ---------------------------------------------------------------------------

function parseContentData(contentPath: string): { pairSynergies: any[]; emergentRules: any[] } {
  const source = fs.readFileSync(contentPath, 'utf-8');
  const sf = ts.createSourceFile(contentPath, source, ts.ScriptTarget.Latest, true);

  const result: { pairSynergies: any[]; emergentRules: any[] } = {
    pairSynergies: [],
    emergentRules: [],
  };

  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf)) {
      const name = node.name.getText(sf);
      if ((name === 'PAIR_SYNERGIES_DATA' || name === 'EMERGENT_RULES_DATA') && node.initializer) {
        const data = extractArrayLiteral(node.initializer, sf);
        if (name === 'PAIR_SYNERGIES_DATA') result.pairSynergies = data;
        else result.emergentRules = data;
      }
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sf, visit);
  return result;
}

function extractArrayLiteral(node: ts.Node, sf: ts.SourceFile): any[] {
  if (!ts.isArrayLiteralExpression(node)) return [];
  return node.elements.map(el => extractValue(el, sf));
}

function extractValue(node: ts.Node, sf: ts.SourceFile): any {
  if (ts.isObjectLiteralExpression(node)) {
    const obj: Record<string, any> = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const key = prop.name.getText(sf);
        obj[key] = extractValue(prop.initializer, sf);
      }
    }
    return obj;
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(el => extractValue(el, sf));
  }
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.getText(sf) === 'true') return true;
  if (node.getText(sf) === 'false') return false;
  if (node.getText(sf) === 'null') return null;
  return node.getText(sf);
}

// ---------------------------------------------------------------------------
// 6. Main audit function
// ---------------------------------------------------------------------------

// Extra non-union names produced by specific dispatcher branches (lists / map
// spawns / data-bag entries that aren't members of StatName/FlagName/VerbName
// but are still part of the result contract).
const DATA_FIELDS: { name: string; kind: Kind }[] = [
  { name: 'poisonTrapPositions', kind: 'data' },
  { name: 'emergentPermanentStealthTerrains', kind: 'data' },
];

export function runAudit(): AuditResult {
  const primitivesPath = path.join(SRC, 'systems', 'synergyPrimitives.ts');
  const statNames = parseStringUnion(primitivesPath, 'StatName');
  const flagNames = parseStringUnion(primitivesPath, 'FlagName');
  const verbNames = parseStringUnion(primitivesPath, 'VerbName');

  // The contract surface: every key that a consumer might query.
  const fieldKinds = new Map<string, Kind>();
  for (const n of statNames) fieldKinds.set(n, 'stat');
  for (const n of flagNames) fieldKinds.set(n, 'flag');
  for (const n of verbNames) fieldKinds.set(n, 'verb');
  for (const d of DATA_FIELDS) fieldKinds.set(d.name, d.kind);

  // Parse content data
  const contentPath = path.join(SRC, 'content', 'synergies', 'index.ts');
  const { pairSynergies, emergentRules } = parseContentData(contentPath);

  // Walk content to find written fields and trigger/target/scaling usages
  const pairWalk = walkContent(pairSynergies);
  const emergentWalk = walkContent(emergentRules);
  const writtenFields = new Set([...pairWalk.writtenFields, ...emergentWalk.writtenFields]);
  const ttsUsages = [...pairWalk.ttsUsages, ...emergentWalk.ttsUsages];

  // Dispatcher-write-branch: a key is writable by the dispatcher if its
  // primitive branch can produce it. For stats/flags/verbs, that's any name in
  // the union (since dispatch is dynamic). For data fields, only the named
  // spawn/stealth branches write them.
  const dispatcherWriteSet = new Set<string>([
    ...statNames, ...flagNames, ...verbNames,
    ...DATA_FIELDS.map(d => d.name),
  ]);

  // Consumer-read check
  const fieldNames = [...fieldKinds.keys()];
  const tsFiles = [
    ...getAllTsFiles(path.join(ROOT, 'src')),
    ...getAllTsFiles(path.join(ROOT, 'tests')),
  ];
  const consumerReads = buildConsumerReadMap(fieldNames, tsFiles);

  // Classify
  const classifications: FieldClassification[] = [];
  const counts: Record<Classification, number> = { live: 0, dead: 0, vestigial: 0, orphan: 0 };

  for (const [field, kind] of fieldKinds) {
    const w = writtenFields.has(field);
    const d = dispatcherWriteSet.has(field);
    const r = consumerReads.get(field) ?? false;

    let cls: Classification;
    if (w && r) cls = 'live';
    else if (!w && !r) cls = 'dead';
    else if (w && !r) cls = 'vestigial';
    else cls = 'orphan'; // !w && r

    counts[cls]++;
    classifications.push({
      field, kind,
      writtenByContent: w,
      dispatcherWriteBranch: d,
      readByConsumer: r,
      classification: cls,
    });
  }

  // Identify inert synergies (all written fields are non-live)
  const liveFieldSet = new Set(
    classifications.filter(f => f.classification === 'live').map(f => f.field),
  );
  const inertSynergies = [
    ...findInertSynergies(pairSynergies, 'pair', liveFieldSet),
    ...findInertSynergies(emergentRules, 'emergent', liveFieldSet),
  ];

  return { fields: classifications, counts, triggerTargetScaling: ttsUsages, unreadFieldViolations: checkDeclaredFieldsRead(), inertSynergies };
}

// ---------------------------------------------------------------------------
// 7. CLI output
// ---------------------------------------------------------------------------

function printReport(result: AuditResult): void {
  const { fields, counts, triggerTargetScaling, unreadFieldViolations, inertSynergies } = result;

  console.log('\n=== Synergy Coverage Audit ===\n');
  console.log(`Total fields: ${fields.length}`);
  console.log(`  live:       ${counts.live}`);
  console.log(`  dead:       ${counts.dead}`);
  console.log(`  vestigial:  ${counts.vestigial}`);
  console.log(`  orphan:     ${counts.orphan}`);

  const w = (s: string, n: number) => s.padEnd(n);
  const col = [38, 6, 8, 8, 8, 12];
  console.log(`\n${w('FIELD', col[0])} ${w('KIND', col[1])} ${w('WRITTEN', col[2])} ${w('DISP', col[3])} ${w('READ', col[4])} ${w('CLASS', col[5])}`);
  console.log('-'.repeat(col.reduce((a, b) => a + b + 1, 0)));

  const byClass = (cls: Classification) => fields.filter(f => f.classification === cls);
  for (const cls of ['dead', 'orphan', 'vestigial', 'live'] as Classification[]) {
    for (const f of byClass(cls)) {
      console.log(
        `${w(f.field, col[0])} ${w(f.kind, col[1])} ${w(f.writtenByContent ? 'yes' : 'no', col[2])} ${w(f.dispatcherWriteBranch ? 'yes' : 'no', col[3])} ${w(f.readByConsumer ? 'yes' : 'no', col[4])} ${w(f.classification, col[5])}`,
      );
    }
  }

  if (triggerTargetScaling.length > 0) {
    console.log(`\n=== trigger/target/scaling usage (${triggerTargetScaling.length}) ===\n`);
    for (const u of triggerTargetScaling) {
      console.log(`  ${u.synergyId} → ${u.primitiveKind}.${u.field} = ${JSON.stringify(u.value)}`);
    }
  } else {
    console.log('\nNo trigger/target/scaling usage found in content.');
  }

  // Phase 6: declared-but-unread primitive field check
  if (unreadFieldViolations.length > 0) {
    console.log(`\n=== Declared-but-unread primitive fields (${unreadFieldViolations.length}) ===\n`);
    for (const v of unreadFieldViolations) {
      console.log(`  ${v.kind}.${v.field} — declared on interface but never read by dispatcher`);
    }
  } else {
    console.log('\nAll declared primitive fields are read by the dispatcher.');
  }

  // Phase 4: inert synergies (no live primitive)
  if (inertSynergies.length > 0) {
    console.log(`\n=== Inert synergies — no live primitive (${inertSynergies.length}) ===\n`);
    for (const s of inertSynergies) {
      console.log(`  [${s.kind}] ${s.id} — written fields: ${s.writtenFields.join(', ')}`);
    }
  } else {
    console.log('\nAll synergies have at least one live primitive.');
  }

  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const result = runAudit();

  const slimDir = path.join(ROOT, '.slim');
  if (!fs.existsSync(slimDir)) fs.mkdirSync(slimDir, { recursive: true });
  const outPath = path.join(slimDir, 'synergy-coverage.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');

  printReport(result);

  console.log(`Wrote ${outPath}\n`);
}

if (process.argv[1]?.endsWith('auditSynergyCoverage.ts')) {
  main().catch(err => { console.error(err); process.exit(1); });
}
