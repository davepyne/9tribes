import abilityDomains from '../../../../src/content/base/ability-domains.json';
import { DOMAIN_SHORT_NAMES } from '../../data/domainMeta';

export function formatDomainName(domainId: string): string {
  return domainId
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatNativeDomainName(domainId: string): string {
  return DOMAIN_SHORT_NAMES[domainId] ?? formatDomainName(domainId);
}

export function getDomainDescription(domainId: string): string | undefined {
  const domain = (abilityDomains.domains as Record<string, { baseEffect?: { description?: string } }>)[domainId];
  return domain?.baseEffect?.description;
}
