#!/usr/bin/env node
/**
 * Generate ComfyUI/Flux prompt manifests for every synergy card.
 *
 * Reads:
 *   - src/content/base/pair-synergies.json
 *   - src/content/base/emergent-rules.json
 *   - src/content/base/civilizations.json
 *
 * Writes:
 *   - tools/synergy-art/prompts.json
 *       Full manifest. One entry per art file the resolver looks for:
 *         pairs/{a}_{b}.png            (alphabetical pair, faction-agnostic)
 *         triples/{factionId}_{ruleId}.png  (only for triples a faction can plausibly reach)
 *
 *   - tools/synergy-art/prompts.csv
 *       Flat CSV (filename, prompt, negative_prompt) — easy to paste into a batch UI.
 *
 *   - tools/synergy-art/comfyui-batch.txt
 *       Newline-delimited "filename||prompt" pairs. Wire into a ComfyUI loop
 *       node that reads the file, splits on "||", and writes outputs to the
 *       corresponding filename. (See README in the same folder.)
 *
 * Usage:
 *   node scripts/generateSynergyArtPrompts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(ROOT, 'src', 'content', 'base');
const OUT_DIR = path.join(ROOT, 'tools', 'synergy-art');

const pairs = JSON.parse(fs.readFileSync(path.join(CONTENT, 'pair-synergies.json'), 'utf8')).pairSynergies;
const rules = JSON.parse(fs.readFileSync(path.join(CONTENT, 'emergent-rules.json'), 'utf8')).rules;
const civsRaw = JSON.parse(fs.readFileSync(path.join(CONTENT, 'civilizations.json'), 'utf8'));
const civs = Object.values(civsRaw);
const domainsData = JSON.parse(fs.readFileSync(path.join(CONTENT, 'ability-domains.json'), 'utf8')).domains;
const researchData = JSON.parse(fs.readFileSync(path.join(CONTENT, 'research.json'), 'utf8'));

// ── Style anchors — locked across the whole set so cards feel cohesive ──
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

// ── Domain → visual vocabulary ──
const DOMAIN_VOCAB = {
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

const FACTION_ANCHOR = {
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

// ── Helpers ──
function sortPairKey(domains) {
  return [...domains].sort();
}

function pairFilename(domains) {
  const [a, b] = sortPairKey(domains);
  return `pairs/${a}_${b}.png`;
}

function tripleFilename(factionId, ruleId) {
  return `triples/${factionId}_${ruleId}.png`;
}

function vocab(d) {
  return DOMAIN_VOCAB[d] ?? { motif: d.replace(/_/g, ' '), color: 'amber', tone: 'arcane' };
}

function pairPrompt(syn) {
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

/**
 * Decide which factions are reachable for a given emergent rule.
 * For now we generate a triple image for every (faction × rule) pair —
 * ComfyUI batches are cheap when run overnight, and the resolver gracefully
 * falls back if a file is missing. If you want to prune: cross-reference
 * civilizations.json capabilitySeeds with rule.domainSets.
 */
function reachableFactionsForRule(_rule) {
  return civs.map((c) => c.id);
}

function triplePrompt(rule, faction) {
  const domains = rule.domainSets ? Object.values(rule.domainSets).flat() : (rule.combatDomains ?? []);
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

// ── Solo domain prompts ──

function soloPrompt(domainId) {
  const v = vocab(domainId);
  const d = domainsData[domainId];
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

function soloTierDescriptions(domainId) {
  const nodes = researchData[domainId]?.nodes;
  if (!nodes) return null;
  return {
    t1: nodes[`${domainId}_t1`]?.qualitativeEffect?.description ?? '',
    t2: nodes[`${domainId}_t2`]?.qualitativeEffect?.description ?? '',
    t3: nodes[`${domainId}_t3`]?.qualitativeEffect?.description ?? '',
  };
}

// ── Build manifest ──
const entries = [];

// Solo art — one per domain
for (const domainId of Object.keys(domainsData)) {
  entries.push({
    kind: 'solo',
    filename: `solos/${domainId}.jpg`,
    domainId,
    domainName: domainsData[domainId].name,
    baseEffect: domainsData[domainId].baseEffect?.description ?? '',
    tierDescriptions: soloTierDescriptions(domainId),
    prompt: soloPrompt(domainId),
    negative_prompt: NEGATIVE,
  });
}

// Pair art — one per unique unordered pair of domains across all synergies
const seenPairs = new Set();
for (const syn of pairs) {
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

// Triple art — per (faction × rule)
for (const rule of rules) {
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
  const escape = (s) => `"${s.replace(/"/g, '""')}"`;
  csvRows.push([escape(e.filename), escape(e.prompt), escape(e.negative_prompt)].join(','));
}
fs.writeFileSync(path.join(OUT_DIR, 'prompts.csv'), csvRows.join('\n'));

const batchLines = entries.map((e) => `${e.filename}||${e.prompt}`);
fs.writeFileSync(path.join(OUT_DIR, 'comfyui-batch.txt'), batchLines.join('\n'));

// Summary
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
