#!/usr/bin/env node
// ============================================================================
// Synergy Coverage Audit — Phase 1 of synergy-primitives cleanup plan
// ============================================================================
//
// Enumerates SynergyCombatResult fields, classifies each as
// live/dead/vestigial/orphan, and reports trigger/target/scaling usage.
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

export interface FieldClassification {
  field: string;
  type: string;
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

export interface AuditResult {
  fields: FieldClassification[];
  counts: Record<Classification, number>;
  triggerTargetScaling: TriggerTargetUsage[];
}

// ---------------------------------------------------------------------------
// Excluded paths for consumer-read checks (mechanical copies, not consumption)
// ---------------------------------------------------------------------------

const EXCLUDED_SUFFIXES = [
  '/systems/synergyTypes.ts',
  '/systems/synergyEffects.ts',
  '/systems/primitiveDispatcher.ts',
  '/systems/combat-action/types.ts',
  '/systems/combat-action/preview.ts',
  '/systems/combat-action/labeling.ts',
];

// ---------------------------------------------------------------------------
// 1. Parse SynergyCombatResult fields (TS Compiler API — no regex)
// ---------------------------------------------------------------------------

function parseInterfaceFields(filePath: string, interfaceName: string): Map<string, string> {
  const source = fs.readFileSync(filePath, 'utf-8');
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const fields = new Map<string, string>();

  function visit(node: ts.Node) {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      for (const member of node.members) {
        if (ts.isPropertySignature(member) && member.name && ts.isIdentifier(member.name)) {
          fields.set(member.name.text, member.type ? member.type.getText(sf) : 'unknown');
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sf, visit);
  return fields;
}

// ---------------------------------------------------------------------------
// 2. Parse string-literal unions (StatName, FlagName)
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
// 3. Map primitive → result fields (mirrors primitiveDispatcher.ts logic)
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
        case 'formationCrush': return ['formationCrushStacks'];
        case 'frostbite': return ['frostbiteStacks', 'frostbiteColdDoT', 'frostbiteSlow'];
        case 'armorBroken': return ['armorPiercing'];
        case 'stealth':
          return p.duration === 'permanent'
            ? ['emergentPermanentStealth', 'emergentPermanentStealthTerrains']
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
    case 'grantVerb':
      switch (p.verb) {
        case 'positionSwap': return ['positionSwapAvailable'];
        case 'secondCharge':
        case 'waiveChargeCooldown': return ['chargeCooldownWaived'];
        case 'retreatThroughImpassable': return ['ghostPassActive'];
        case 'opportunityStrikeOnDisengage': return ['fightingRetreatFreeStrike'];
        case 'fortUp': return ['mobileStrongholdFortUp'];
        case 'carryCaptured': return ['caravanPassengerActive'];
        case 'retreatToWater': return ['beachRaidRetreatToWater'];
        case 'reEnterStealth': return ['reEnterStealthAfterCombat'];
        case 'redeployOnKill': return ['emergentKillChainRedeployRange'];
        default: return [];
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
// 4. Walk content data — collect written fields + trigger/target/scaling
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
// 5. Consumer-read check (grep .ts files outside excluded paths)
// ---------------------------------------------------------------------------

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
    const re = new RegExp(`\\.${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    let found = false;
    for (const [, content] of fileContents) {
      if (re.test(content)) { found = true; break; }
    }
    result.set(field, found);
  }
  return result;
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
    // Look for variable declarations of PAIR_SYNERGIES_DATA and EMERGENT_RULES_DATA
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
// 7. Main audit function
// ---------------------------------------------------------------------------

export function runAudit(): AuditResult {
  // Parse SynergyCombatResult fields
  const fields = parseInterfaceFields(
    path.join(SRC, 'systems', 'synergyTypes.ts'),
    'SynergyCombatResult',
  );

  // Parse string-literal unions
  const primitivesPath = path.join(SRC, 'systems', 'synergyPrimitives.ts');
  const statNames = new Set(parseStringUnion(primitivesPath, 'StatName'));
  const flagNames = new Set(parseStringUnion(primitivesPath, 'FlagName'));

  // Parse content data
  const contentPath = path.join(SRC, 'content', 'synergies', 'index.ts');
  const { pairSynergies, emergentRules } = parseContentData(contentPath);

  // Walk content to find written fields and trigger/target/scaling usages
  const pairWalk = walkContent(pairSynergies);
  const emergentWalk = walkContent(emergentRules);
  const writtenFields = new Set([...pairWalk.writtenFields, ...emergentWalk.writtenFields]);
  // additionalEffects is always written by every dispatch function
  writtenFields.add('additionalEffects');
  const ttsUsages = [...pairWalk.ttsUsages, ...emergentWalk.ttsUsages];

  // Dispatcher-write-branch: a field is writable if:
  //   - it's a StatName (dispatchStatMod uses dynamic key), or
  //   - it's a FlagName (dispatchSetFlag uses dynamic key), or
  //   - a specific dispatch branch writes to it
  const specificDispatchFields = new Set([
    // applyStatus
    'poisonStacks', 'stunDuration', 'formationCrushStacks',
    'frostbiteStacks', 'frostbiteColdDoT', 'frostbiteSlow', 'armorPiercing',
    'emergentPermanentStealth', 'emergentPermanentStealthTerrains',
    // knockback
    'knockbackDistance', 'formationPinballCollisionDamage',
    // heal
    'synergyFlatHeal', 'synergyPercentHealMaxHp',
    // capture
    'chargeCaptureChance', 'retreatCaptureChance', 'stealthCaptureBonus', 'navalCaptureBonus',
    'emergentCaptureBelowHpPercent',
    // preventAction
    'antiDisplacement', 'emergentUndying', 'emergentIgnoreZoc', 'captureEscapePrevented',
    'ghostPassActive',
    // spawnOnMap
    'poisonTrapPositions', 'emergentPoisonCloudPreventsHealing', 'sandstormDamage', 'contaminateActive',
    // grantVerb
    'positionSwapAvailable', 'chargeCooldownWaived', 'fightingRetreatFreeStrike',
    'mobileStrongholdFortUp', 'caravanPassengerActive', 'beachRaidRetreatToWater',
    'reEnterStealthAfterCombat',
    'emergentKillChainRedeployRange',
    // instantKill
    'instantKill',
    // always written by every dispatch
    'additionalEffects',
  ]);

  function hasDispatcherBranch(field: string): boolean {
    return statNames.has(field) || flagNames.has(field) || specificDispatchFields.has(field);
  }

  // Consumer-read check
  const fieldNames = [...fields.keys()];
  const tsFiles = [
    ...getAllTsFiles(path.join(ROOT, 'src')),
    ...getAllTsFiles(path.join(ROOT, 'tests')),
  ];
  const consumerReads = buildConsumerReadMap(fieldNames, tsFiles);

  // Classify
  const classifications: FieldClassification[] = [];
  const counts: Record<Classification, number> = { live: 0, dead: 0, vestigial: 0, orphan: 0 };

  for (const [field, type] of fields) {
    const w = writtenFields.has(field);
    const d = hasDispatcherBranch(field);
    const r = consumerReads.get(field) ?? false;

    let cls: Classification;
    if (w && r) cls = 'live';
    else if (!w && !r) cls = 'dead';
    else if (w && !r) cls = 'vestigial';
    else cls = 'orphan'; // !w && r

    counts[cls]++;
    classifications.push({ field, type, writtenByContent: w, dispatcherWriteBranch: d, readByConsumer: r, classification: cls });
  }

  return { fields: classifications, counts, triggerTargetScaling: ttsUsages };
}

// ---------------------------------------------------------------------------
// 8. CLI output
// ---------------------------------------------------------------------------

function printReport(result: AuditResult): void {
  const { fields, counts, triggerTargetScaling } = result;

  // Header
  console.log('\n=== Synergy Coverage Audit ===\n');
  console.log(`Total fields: ${fields.length}`);
  console.log(`  live:       ${counts.live}`);
  console.log(`  dead:       ${counts.dead}`);
  console.log(`  vestigial:  ${counts.vestigial}`);
  console.log(`  orphan:     ${counts.orphan}`);

  // Table
  const w = (s: string, n: number) => s.padEnd(n);
  const col = [38, 8, 8, 8, 8, 12];
  console.log(`\n${w('FIELD', col[0])} ${w('TYPE', col[1])} ${w('WRITTEN', col[2])} ${w('DISP', col[3])} ${w('READ', col[4])} ${w('CLASS', col[5])}`);
  console.log('-'.repeat(col.reduce((a, b) => a + b + 1, 0)));

  const byClass = (cls: Classification) => fields.filter(f => f.classification === cls);
  for (const cls of ['dead', 'orphan', 'vestigial', 'live'] as Classification[]) {
    for (const f of byClass(cls)) {
      console.log(
        `${w(f.field, col[0])} ${w(f.type.substring(0, 6), col[1])} ${w(f.writtenByContent ? 'yes' : 'no', col[2])} ${w(f.dispatcherWriteBranch ? 'yes' : 'no', col[3])} ${w(f.readByConsumer ? 'yes' : 'no', col[4])} ${w(f.classification, col[5])}`,
      );
    }
  }

  // Trigger/target/scaling report
  if (triggerTargetScaling.length > 0) {
    console.log(`\n=== trigger/target/scaling usage (${triggerTargetScaling.length}) ===\n`);
    for (const u of triggerTargetScaling) {
      console.log(`  ${u.synergyId} → ${u.primitiveKind}.${u.field} = ${JSON.stringify(u.value)}`);
    }
  } else {
    console.log('\nNo trigger/target/scaling usage found in content.');
  }

  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const result = runAudit();

  // Write JSON
  const slimDir = path.join(ROOT, '.slim');
  if (!fs.existsSync(slimDir)) fs.mkdirSync(slimDir, { recursive: true });
  const outPath = path.join(slimDir, 'synergy-coverage.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');

  // Print report
  printReport(result);

  console.log(`Wrote ${outPath}\n`);
}

// Run when executed directly
if (process.argv[1]?.endsWith('auditSynergyCoverage.ts')) {
  main().catch(err => { console.error(err); process.exit(1); });
}
