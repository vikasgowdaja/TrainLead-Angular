import { describe, expect, it } from 'vitest';
import { RequirementDraftSchema } from './index.js';

describe('RequirementDraftSchema', () => {
  it('accepts the Mysuru workshop example and keeps its dates explicit', () => {
    const requirement = RequirementDraftSchema.parse({
      technologyStack: ['AngularJS'],
      startDate: '2026-11-02',
      endDate: '2026-11-07',
      durationDays: 6,
      college: null,
      city: 'Mysuru',
      audience: '6th sem engineering students',
      tfa: 'Provided',
      paymentDate: '2026-11-25',
      summary: 'Six-day AngularJS workshop in Mysuru.',
    });

    expect(requirement).toMatchObject({
      technologyStack: ['AngularJS'],
      startDate: '2026-11-02',
      endDate: '2026-11-07',
      durationDays: 6,
      city: 'Mysuru',
      audience: '6th sem engineering students',
      tfa: 'Provided',
      paymentDate: '2026-11-25',
      mode: 'Unknown',
      travel: 'Unknown',
    });
  });

  it('rejects a date that is not an ISO calendar date', () => {
    const result = RequirementDraftSchema.safeParse({
      technologyStack: ['AngularJS'],
      startDate: '2 Nov',
      endDate: '2026-11-07',
      durationDays: 6,
      college: null,
      city: 'Mysuru',
      audience: '6th sem engineering students',
      summary: 'Six-day AngularJS workshop in Mysuru.',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an end date before the start date', () => {
    const result = RequirementDraftSchema.safeParse({
      technologyStack: ['AngularJS'],
      startDate: '2026-11-07',
      endDate: '2026-11-02',
      durationDays: 6,
      city: 'Mysuru',
      audience: '6th sem engineering students',
      summary: 'Six-day AngularJS workshop in Mysuru.',
    });

    expect(result.success).toBe(false);
  });
});