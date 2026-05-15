import { getAbilityDomainById } from '../../../../src/content/domains/index.js';
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
  return getAbilityDomainById(domainId)?.baseEffect.description;
}
