import { createHash } from 'node:crypto';
import type { RequirementDraft } from '@trainlead/shared';

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-IN').replace(/\s+/g, ' ');
}

export function createOpportunityKey(requirement: RequirementDraft): string {
  const identity = [
    requirement.technologyStack.map(normalize).sort().join(','),
    normalize(requirement.college ?? ''),
    normalize(requirement.city),
    requirement.startDate,
  ].join('|');

  return createHash('sha256').update(identity).digest('hex');
}