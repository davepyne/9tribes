import abilityDomains from '../../data/ability-domains.json';

export function formatDomainName(domainId: string): string {
  return domainId
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const NATIVE_DOMAIN_DISPLAY_NAMES: Record<string, string> = {
  venom: 'Venom',
  nature_healing: 'Healer',
  hitrun: 'Hit & Run',
  fortress: 'Fortify',
  slaving: 'Slavery',
  camel_adaptation: 'Desert-Adept',
  charge: 'Charge',
  river_stealth: 'Stealth',
  heavy_hitter: 'Shock',
};

export function formatNativeDomainName(domainId: string): string {
  return NATIVE_DOMAIN_DISPLAY_NAMES[domainId] ?? formatDomainName(domainId);
}

export function getDomainDescription(domainId: string): string | undefined {
  const domain = (abilityDomains.domains as Record<string, { baseEffect?: { description?: string } }>)[domainId];
  return domain?.baseEffect?.description;
}
