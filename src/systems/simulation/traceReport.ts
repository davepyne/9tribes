import type { GameState } from '../../game/types.js';
import type { SimulationTrace, TraceCombatEvent, TraceSiegeEvent, TraceAiIntentEvent, TraceFactionStrategyEvent, TraceResearchEvent, TraceDomainLearnedEvent, TraceTripleStackEvent, TraceSynergyPairEvent } from './traceTypes.js';
import { getBattleCount, getKillCount } from '../historySystem.js';
import { getVictoryStatus } from './victory.js';

export type ReportFocus = 'siege' | 'combat' | 'ai' | 'strategy' | 'research' | 'synergy' | 'full';

export interface ReportOptions {
  focus?: ReportFocus;
  factions?: string[];
  turnRange?: [number, number];
  seed?: number;
  turns?: number;
  difficulty?: string;
}

const ALL_FOCUSES: ReportFocus[] = ['siege', 'combat', 'ai', 'strategy'];

function shouldInclude(focus: ReportFocus, category: ReportFocus): boolean {
  return focus === 'full' || focus === category;
}

function factionMatch(factions: string[] | undefined, factionId: string): boolean {
  return !factions || factions.includes(factionId);
}

function turnMatch(turnRange: [number, number] | undefined, turn: number): boolean {
  return !turnRange || (turn >= turnRange[0] && turn <= turnRange[1]);
}

function fmtHeader(opts: ReportOptions, state: GameState): string {
  const victory = getVictoryStatus(state);
  const winner = victory.winnerFactionId ?? 'none';
  return `SEED=${opts.seed ?? '?'} TURNS=${opts.turns ?? state.round} DIFF=${opts.difficulty ?? '?'} WINNER=${winner} TYPE=${victory.victoryType} ROUND=${state.round}`;
}

function fmtFactions(state: GameState, factions?: string[]): string {
  const lines: string[] = ['FACTIONS:'];
  for (const [id, faction] of state.factions) {
    if (factions && !factions.includes(id)) continue;
    const living = faction.unitIds.filter(uid => state.units.has(uid));
    const battles = living.reduce((s, uid) => s + getBattleCount(state.units.get(uid)!), 0);
    const kills = living.reduce((s, uid) => s + getKillCount(state.units.get(uid)!), 0);
    const cities = faction.cityIds.length;
    const villages = faction.villageIds.length;
    const we = state.warExhaustion.get(id);
    const weStr = we && we.exhaustionPoints > 0 ? `we${we.exhaustionPoints}` : '';
    const learned = faction.learnedDomains.length > 1 ? ` dom${faction.learnedDomains.length}` : '';
    const triple = faction.activeTripleStack ? ` triple=${faction.activeTripleStack.name}` : '';
    lines.push(`  ${id}: u${living.length} c${cities} v${villages} bat${battles} kill${kills}${learned}${triple} ${weStr}`.trim());
  }
  return lines.join('\n');
}

function fmtSiege(events: TraceSiegeEvent[] | undefined, factions: string[] | undefined, turnRange: [number, number] | undefined): string {
  if (!events?.length) return '';
  const filtered = events.filter(e =>
    factionMatch(factions, e.factionId) && turnMatch(turnRange, e.round)
  );
  if (!filtered.length) return '';
  const lines = ['SIEGE:'];
  for (const e of filtered) {
    const atk = e.attackerFactionId ? ` ${e.attackerFactionId}->` : '';
    lines.push(`  T${e.round} ${e.eventType}${atk}${e.factionId} ${e.cityId}(${e.cityName}) wall${e.wallHP}/${e.maxWallHP} besieged${e.turnsUnderSiege}`);
  }
  return lines.join('\n');
}

function fmtCombat(events: TraceCombatEvent[] | undefined, factions: string[] | undefined, turnRange: [number, number] | undefined): string {
  if (!events?.length) return '';
  const filtered = events.filter(e =>
    (factionMatch(factions, e.attackerFactionId) || factionMatch(factions, e.defenderFactionId)) &&
    turnMatch(turnRange, e.round)
  );
  if (!filtered.length) return '';
  const lines = ['COMBAT:'];
  for (const e of filtered) {
    const atkStatus = [e.attackerDestroyed ? 'killed' : '', e.attackerRouted ? 'routed' : '', e.attackerFled ? 'fled' : ''].filter(Boolean).join(',') || 'ok';
    const defStatus = [e.defenderDestroyed ? 'killed' : '', e.defenderRouted ? 'routed' : '', e.defenderFled ? 'fled' : ''].filter(Boolean).join(',') || 'ok';
    lines.push(`  T${e.round} ${e.attackerFactionId}:${e.attackerPrototypeName}(${e.attackerUnitId}) vs ${e.defenderFactionId}:${e.defenderPrototypeName}(${e.defenderUnitId}) dmg${e.attackerDamage}/${e.defenderDamage} hp${e.attackerHpAfter}/${e.defenderHpAfter} [${atkStatus}|${defStatus}]`);
    if (e.breakdown) {
      const mods: string[] = [];
      const m = e.breakdown.modifiers;
      if (m.roleModifier) mods.push(`role${m.roleModifier >= 0 ? '+' : ''}${m.roleModifier}`);
      if (m.weaponModifier) mods.push(`weapon${m.weaponModifier >= 0 ? '+' : ''}${m.weaponModifier}`);
      if (m.flankingBonus) mods.push(`flank+${m.flankingBonus}`);
      if (m.wallDefenseBonus) mods.push(`wall+${m.wallDefenseBonus}`);
      if (m.ambushBonus) mods.push(`ambush+${m.ambushBonus}`);
      if (m.chargeBonus) mods.push(`charge+${m.chargeBonus}`);
      if (mods.length) lines.push(`    mods: ${mods.join(' ')}`);
      const effects = e.breakdown.triggeredEffects;
      if (effects?.length) {
        lines.push(`    effects: ${effects.map(e => `${e.label}:${e.detail}`).join(', ')}`);
      }
    }
  }
  return lines.join('\n');
}

function fmtAiIntent(events: TraceAiIntentEvent[] | undefined, factions: string[] | undefined, turnRange: [number, number] | undefined): string {
  if (!events?.length) return '';
  const filtered = events.filter(e =>
    factionMatch(factions, e.factionId) && turnMatch(turnRange, e.round)
  );
  if (!filtered.length) return '';
  const lines = ['AI_INTENT:'];
  for (const e of filtered) {
    const to = e.to ? `->(${e.to.q},${e.to.r})` : '';
    const from = `(${e.from.q},${e.from.r})`;
    const target = e.targetUnitId ? ` tgt_u${e.targetUnitId}` : e.targetCityId ? ` tgt_${e.targetCityId}` : '';
    lines.push(`  T${e.round} ${e.factionId} u${e.unitId} ${e.intent}${from}${to}${target} "${e.reason}"`);
  }
  return lines.join('\n');
}

function fmtStrategy(events: TraceFactionStrategyEvent[] | undefined, factions: string[] | undefined, turnRange: [number, number] | undefined): string {
  if (!events?.length) return '';
  const filtered = events.filter(e =>
    factionMatch(factions, e.factionId) && turnMatch(turnRange, e.round)
  );
  if (!filtered.length) return '';
  const lines = ['STRATEGY:'];
  for (const e of filtered) {
    const threatened = e.threatenedCityIds.length ? ` threatened=[${e.threatenedCityIds.join(',')}]` : '';
    const enemy = e.primaryEnemyFactionId ? ` enemy=${e.primaryEnemyFactionId}` : '';
    const focus = e.focusTargetUnitIds.length ? ` focus=[${e.focusTargetUnitIds.join(',')}]` : '';
    lines.push(`  T${e.round} ${e.factionId} ${e.posture} obj="${e.primaryObjective}"${enemy}${threatened}${focus}`);
    if (e.reasons.length) lines.push(`    reasons: ${e.reasons.join(' | ')}`);
  }
  return lines.join('\n');
}

function fmtResearch(events: TraceResearchEvent[] | undefined, factions: string[] | undefined, turnRange: [number, number] | undefined): string {
  if (!events?.length) return '';
  const filtered = events.filter(e =>
    factionMatch(factions, e.factionId) && turnMatch(turnRange, e.round)
  );
  if (!filtered.length) return '';
  const lines = ['RESEARCH:'];
  for (const e of filtered) {
    if (e.phase === 'started') {
      lines.push(`  T${e.round} ${e.factionId} start ${e.domainId}:${e.nodeName} "${e.reason ?? ''}"`);
    } else {
      lines.push(`  T${e.round} ${e.factionId} done ${e.domainId}:${e.nodeName}`);
    }
  }
  return lines.join('\n');
}

function fmtDomainLearned(events: TraceDomainLearnedEvent[] | undefined, factions: string[] | undefined, turnRange: [number, number] | undefined): string {
  if (!events?.length) return '';
  const filtered = events.filter(e =>
    factionMatch(factions, e.factionId) && turnMatch(turnRange, e.round)
  );
  if (!filtered.length) return '';
  const lines = ['DOMAINS_LEARNED:'];
  for (const e of filtered) {
    const syn = e.synergizesWith ? ` +syn=${e.synergizesWith}` : '';
    lines.push(`  T${e.round} ${e.factionId} learned ${e.domainName}(${e.domainId}) via_${e.source}${syn}`);
  }
  return lines.join('\n');
}

function fmtTripleStack(events: TraceTripleStackEvent[] | undefined, factions: string[] | undefined, turnRange: [number, number] | undefined): string {
  if (!events?.length) return '';
  const filtered = events.filter(e =>
    factionMatch(factions, e.factionId) && turnMatch(turnRange, e.round)
  );
  if (!filtered.length) return '';
  const lines = ['TRIPLE_STACK:'];
  for (const e of filtered) {
    if (e.phase === 'activated') {
      lines.push(`  T${e.round} ${e.factionId} activated ${e.name} domains=[${e.domains?.join(',')}] rule="${e.emergentRule}"`);
    } else {
      lines.push(`  T${e.round} ${e.factionId} lost ${e.name}`);
    }
  }
  return lines.join('\n');
}

export function generateTraceReport(trace: SimulationTrace, state: GameState, opts: ReportOptions = {}): string {
  const focus = opts.focus ?? 'full';
  const { factions, turnRange } = opts;
  const sections: string[] = [];

  sections.push(fmtHeader(opts, state));
  sections.push(fmtFactions(state, factions));

  if (shouldInclude(focus, 'siege')) {
    const s = fmtSiege(trace.siegeEvents, factions, turnRange);
    if (s) sections.push(s);
  }

  if (shouldInclude(focus, 'combat')) {
    const c = fmtCombat(trace.combatEvents, factions, turnRange);
    if (c) sections.push(c);
  }

  if (shouldInclude(focus, 'ai')) {
    const a = fmtAiIntent(trace.aiIntentEvents, factions, turnRange);
    if (a) sections.push(a);
  }

  if (shouldInclude(focus, 'strategy')) {
    const s = fmtStrategy(trace.factionStrategyEvents, factions, turnRange);
    if (s) sections.push(s);
  }

  if (shouldInclude(focus, 'research')) {
    const r = fmtResearch(trace.researchEvents, factions, turnRange);
    if (r) sections.push(r);
    const d = fmtDomainLearned(trace.domainLearnedEvents, factions, turnRange);
    if (d) sections.push(d);
  }

  if (shouldInclude(focus, 'synergy')) {
    const t = fmtTripleStack(trace.tripleStackEvents, factions, turnRange);
    if (t) sections.push(t);
    const r = fmtResearch(trace.researchEvents, factions, turnRange);
    if (r) sections.push(r);
    const d = fmtDomainLearned(trace.domainLearnedEvents, factions, turnRange);
    if (d) sections.push(d);
  }

  return sections.join('\n');
}
