#!/usr/bin/env tsx
/**
 * Generate ComfyUI/Flux prompt manifests for every synergy card.
 *
 * Reads typed source-of-truth modules:
 *   - src/content/synergies/index.ts (pairs + emergent rules)
 *   - src/content/domains/index.ts   (ability domains + research tiers)
 *   - src/content/base/civilizations.json
 *
 * Writes:
 *   - tools/synergy-art/prompts.json
 *   - tools/synergy-art/prompts.csv
 *   - tools/synergy-art/comfyui-batch.txt
 *
 * Usage:
 *   npm run synergy:art-prompts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAIR_SYNERGIES, EMERGENT_RULES } from '../src/content/synergies/index.js';
import {
  ABILITY_DOMAINS,
  RESEARCH_DOMAINS,
} from '../src/content/domains/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(ROOT, 'src', 'content', 'base');
const OUT_DIR = path.join(ROOT, 'tools', 'synergy-art');

const civsRaw = JSON.parse(fs.readFileSync(path.join(CONTENT, 'civilizations.json'), 'utf8')) as Record<string, { id: string; name: string }>;
const civs = Object.values(civsRaw);

// ── Style anchors ──
const STYLE_BASE =
  'fantasy card illustration in the style of Magic the Gathering art, ' +
  'full-bleed landscape composition, edge-to-edge artwork, ' +
  'cinematic horizontal framing, painterly ink and wash, ' +
  'muted earth-tones with one dominant accent color, ' +
  'atmospheric lighting, arcane and martial mood, ' +
  'no painted frame, no inner border, no decorative trim, ' +
  'no text, no letters, no numbers, no UI, no card frame';

const NEGATIVE =
  'painted frame, decorative border, double border, ornate trim, ornamental frame, ' +
  'filigree border, tarot card border, card frame, vignette frame, inner border, ' +
  'text, letters, numbers, words, signature, watermark, caption, label, logo, title bar, ' +
  'portrait orientation, vertical composition, centered medallion, symmetrical heraldic layout, ' +
  'photo, photograph, photorealistic, 3d render, cgi, anime, manga, chibi, ' +
  'modern clothing, cars, technology, ui, hud, low quality, blurry, oversaturated';

const DOMAIN_VOCAB: Record<string, { motif: string; color: string; tone: string }> = {
  venom:           { motif: 'serpents and dripping toxin', color: 'venom green',         tone: 'sickly luminescence' },
  fortress:        { motif: 'tower walls and shield bosses', color: 'iron blue',         tone: 'monolithic stillness' },
  charge:          { motif: 'tusked beasts and trampling cavalry', color: 'amber dust',  tone: 'forward motion, dust trails' },
  hitrun:          { motif: 'darting arrows and feathered wind-marks', color: 'silver-grey', tone: 'flickering speed' },
  tidal_warfare:   { motif: 'cresting waves and prow-ships', color: 'deep cyan',         tone: 'crashing surf, salt spray' },
  slaving:         { motif: 'iron chains and tally markings', color: 'rust red',         tone: 'cruel order, branded marks' },
  nature_healing:  { motif: 'leafing branches and resting deer', color: 'leaf green',    tone: 'soft luminance, restorative' },
  river_stealth:   { motif: 'reeds, mist on still water, half-submerged eyes', color: 'violet shadow', tone: 'hidden, glassy water' },
  camel_adaptation:{ motif: 'sun-bleached camels and dune ridges', color: 'ochre gold',  tone: 'dry shimmer, baked sand' },
  heavy_hitter:    { motif: 'mauls, anvils, broken stone', color: 'cold slate',          tone: 'crushing weight' },
};

const FACTION_ANCHOR: Record<string, string> = {
  jungle_clan:    'verdant rainforest, dripping vines, jaguar pelts',
  druid_circle:   'oak grove, standing stones, antlered figures',
  steppe_clan:    'open grassland under wide sky, horsehair banners',
  hill_clan:      'craggy heights, basalt walls, terraced ridges',
  coral_people:   'reef-bone architecture, salt-bleached sails, brine',
  desert_nomads:  'red dunes and sun, woven indigo robes',
  savannah_lions: 'tall grass, acacia silhouettes, lion totems',
  river_people:   'reed boats, lotus, mud-brick',
  frost_wardens:  'ice and pine, breath visible, blue dusk',
};

function sortPairKey(domains: readonly string[]): string[] {
  return [...domains].sort();
}

function pairFilename(domains: readonly string[]): string {
  const [a, b] = sortPairKey(domains);
  return `pairs/${a}_${b}.png`;
}

function tripleFilename(factionId: string, ruleId: string): string {
  return `triples/${factionId}_${ruleId}.png`;
}

function vocab(d: string) {
  return DOMAIN_VOCAB[d] ?? { motif: d.replace(/_/g, ' '), color: 'amber', tone: 'arcane' };
}

function pairPrompt(syn: typeof PAIR_SYNERGIES[number]): string {
  const [a, b] = syn.domains;
  const va = vocab(a);
  const vb = vocab(b);
  const fragments = [
    `${syn.name}, wide landscape scene depicting ${va.motif} interacting with ${vb.motif}`,
    `composition spans the full horizontal frame, foreground action with atmospheric background`,
    `dominant palette ${va.color} balanced against ${vb.color}`,
    `mood: ${va.tone} crossed with ${vb.tone}`,
    syn.friendlyFlavor ? `evokes: ${syn.friendlyFlavor}` : null,
    STYLE_BASE,
  ].filter(Boolean);
  return fragments.join(', ');
}

function reachableFactionsForRule(_rule: typeof EMERGENT_RULES[number]): string[] {
  return civs.map((c) => c.id);
}

function triplePrompt(rule: typeof EMERGENT_RULES[number], faction: { id: string; name: string }): string {
  const domains = rule.domainSets
    ? Object.values(rule.domainSets).flat()
    : (rule.combatDomains ?? rule.mobilityDomains ?? []);
  const motifs = domains.slice(0, 3).map((d) => vocab(d).motif).join('; ');
  const fragments = [
    `${rule.name} — splash rare scene depicting ${faction.name} at the moment of an emergent power`,
    `setting: ${FACTION_ANCHOR[faction.id] ?? 'mythic battlefield'}`,
    `wide cinematic landscape composition, dramatic depth from foreground to horizon`,
    `iconography woven into the scene: ${motifs}`,
    `heightened drama, painterly highlights, the rarest card in the deck`,
    rule.friendlyFlavor ? `evokes: ${rule.friendlyFlavor}` : null,
    STYLE_BASE,
  ].filter(Boolean);
  return fragments.join(', ');
}

function soloPrompt(domainId: string): string {
  const v = vocab(domainId);
  const d = ABILITY_DOMAINS[domainId];
  const baseDesc = d?.baseEffect?.description ?? '';
  const fragments = [
    `${d?.name ?? domainId}, wide landscape scene depicting ${v.motif}`,
    `single-icon composition with the domain's elemental theme filling the frame`,
    `dominant palette ${v.color}, mood: ${v.tone}`,
    baseDesc ? `evokes: ${baseDesc}` : null,
    STYLE_BASE,
  ].filter(Boolean);
  return fragments.join(', ');
}

function soloTierDescriptions(domainId: string) {
  const domain = RESEARCH_DOMAINS[domainId];
  if (!domain) return null;
  return {
    t1: domain.nodes[`${domainId}_t1`]?.qualitativeEffect?.description ?? '',
    t2: domain.nodes[`${domainId}_t2`]?.qualitativeEffect?.description ?? '',
    t3: domain.nodes[`${domainId}_t3`]?.qualitativeEffect?.description ?? '',
  };
}

// ── Build manifest ──
type Entry = Record<string, unknown> & { kind: string; filename: string; prompt: string; negative_prompt: string };
const entries: Entry[] = [];

for (const domainId of Object.keys(ABILITY_DOMAINS)) {
  entries.push({
    kind: 'solo',
    filename: `solos/${domainId}.jpg`,
    domainId,
    domainName: ABILITY_DOMAINS[domainId].name,
    baseEffect: ABILITY_DOMAINS[domainId].baseEffect?.description ?? '',
    tierDescriptions: soloTierDescriptions(domainId),
    prompt: soloPrompt(domainId),
    negative_prompt: NEGATIVE,
  });
}

const seenPairs = new Set<string>();
for (const syn of PAIR_SYNERGIES) {
  const key = sortPairKey(syn.domains).join('+');
  if (seenPairs.has(key)) continue;
  seenPairs.add(key);
  entries.push({
    kind: 'pair',
    filename: pairFilename(syn.domains),
    synergyId: syn.id,
    synergyName: syn.name,
    domains: sortPairKey(syn.domains),
    prompt: pairPrompt(syn),
    negative_prompt: NEGATIVE,
  });
}

for (const rule of EMERGENT_RULES) {
  for (const factionId of reachableFactionsForRule(rule)) {
    const faction = civsRaw[factionId];
    if (!faction) continue;
    entries.push({
      kind: 'triple',
      filename: tripleFilename(factionId, rule.id),
      ruleId: rule.id,
      ruleName: rule.name,
      factionId,
      factionName: faction.name,
      prompt: triplePrompt(rule, faction),
      negative_prompt: NEGATIVE,
    });
  }
}

// ── Write outputs ──
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'solos'), { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'pairs'), { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'triples'), { recursive: true });

fs.writeFileSync(
  path.join(OUT_DIR, 'prompts.json'),
  JSON.stringify({ count: entries.length, entries }, null, 2),
);

const csvRows = ['filename,prompt,negative_prompt'];
for (const e of entries) {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  csvRows.push([escape(e.filename), escape(e.prompt), escape(e.negative_prompt)].join(','));
}
fs.writeFileSync(path.join(OUT_DIR, 'prompts.csv'), csvRows.join('\n'));

const batchLines = entries.map((e) => `${e.filename}||${e.prompt}`);
fs.writeFileSync(path.join(OUT_DIR, 'comfyui-batch.txt'), batchLines.join('\n'));

const soloCount = entries.filter((e) => e.kind === 'solo').length;
const pairCount = entries.filter((e) => e.kind === 'pair').length;
const tripleCount = entries.filter((e) => e.kind === 'triple').length;
console.log(`Wrote ${entries.length} prompts (${soloCount} solos, ${pairCount} pairs, ${tripleCount} triples)`);
console.log(`  -> ${path.relative(ROOT, path.join(OUT_DIR, 'prompts.json'))}`);
console.log(`  -> ${path.relative(ROOT, path.join(OUT_DIR, 'prompts.csv'))}`);
console.log(`  -> ${path.relative(ROOT, path.join(OUT_DIR, 'comfyui-batch.txt'))}`);
console.log(`Place generated images at:`);
console.log(`  web/public/assets/synergy-cards/solos/<domainId>.jpg`);
console.log(`  web/public/assets/synergy-cards/pairs/<a>_<b>.jpg`);
console.log(`  web/public/assets/synergy-cards/triples/<factionId>_<ruleId>.jpg`);
