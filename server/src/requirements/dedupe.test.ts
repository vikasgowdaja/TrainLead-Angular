import { describe, expect, it } from 'vitest';
import { RequirementDraftSchema } from '@trainlead/shared';
import { createOpportunityKey } from './dedupe.js';

const baseDraft = RequirementDraftSchema.parse({
  technologyStack: ['AngularJS'],
  startDate: '2026-11-02',
  endDate: '2026-11-07',
  durationDays: 6,
  city: 'Mysuru',
  audience: '6th sem engineering students',
  tfa: 'Provided',
  summary: 'AngularJS workshop for students.',
});

describe('createOpportunityKey', () => {
  it('normalizes technology, city, and whitespace for exact reposts', () => {
    const repost = {
      ...baseDraft,
      technologyStack: [' angularjs '],
      city: 'MYSURU',
    };

    expect(createOpportunityKey(repost)).toBe(createOpportunityKey(baseDraft));
  });

  it('keeps opportunities with different start dates separate', () => {
    const later = { ...baseDraft, startDate: '2026-11-03' };

    expect(createOpportunityKey(later)).not.toBe(createOpportunityKey(baseDraft));
  });
});