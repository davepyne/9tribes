import abilityDomains from '../../../src/content/base/ability-domains.json';

const domains = abilityDomains.domains as Record<string, { id: string; name: string }>;

export const DOMAIN_IDS = Object.keys(domains) as readonly string[];
export type DomainId = typeof DOMAIN_IDS[number];

export const DOMAIN_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(domains).map(([id, d]) => [id, d.name]),
);

// Frontend-only display overrides (short names for compact UI contexts)
export const DOMAIN_SHORT_NAMES: Record<string, string> = {
  venom: 'Venom',
  fortress: 'Fortify',
  charge: 'Charge',
  hitrun: 'Hit & Run',
  tidal_warfare: 'Tidal',
  slaving: 'Slavery',
  nature_healing: 'Healer',
  river_stealth: 'Stealth',
  camel_adaptation: 'Desert-Adept',
  heavy_hitter: 'Shock',
};

// Frontend-only: display colors for domain chips/badges
export const DOMAIN_COLORS: Record<string, string> = {
  venom: '#4ade80',
  fortress: '#60a5fa',
  charge: '#f59e0b',
  hitrun: '#94a3b8',
  tidal_warfare: '#22d3ee',
  slaving: '#dc2626',
  nature_healing: '#10b981',
  river_stealth: '#a855f7',
  camel_adaptation: '#d97706',
  heavy_hitter: '#64748b',
};

// Frontend-only: research tree column names (shorter than canonical, longer than chip labels)
export const DOMAIN_TREE_NAMES: Record<string, string> = {
  venom: 'Venom',
  fortress: 'Fortress',
  charge: 'Charge',
  hitrun: 'Hit & Run',
  nature_healing: 'Nature Healing',
  camel_adaptation: 'Camel Adapt',
  tidal_warfare: 'Tidal War',
  river_stealth: 'River Stealth',
  slaving: 'Slaving',
  heavy_hitter: 'Heavy Hitter',
};

// Frontend-only: display icons for domain chips/badges
export const DOMAIN_ICONS: Record<string, string> = {
  venom: '☣',
  fortress: '⛨',
  charge: '\u{1F418}',
  hitrun: '❯',
  tidal_warfare: '\u{1F30A}',
  slaving: '⚔',
  nature_healing: '✾',
  river_stealth: '\u{1F30F}',
  camel_adaptation: '\u{1F42A}',
  heavy_hitter: '⚖',
};
