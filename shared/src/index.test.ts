import { describe, expect, it } from 'vitest';
import { AddMemberSchema, CreateRequirementSchema, RequirementInputSchema, RequirementQuerySchema, canTransition, skillKey } from './index.js';

const mysuru = {
  title: 'AngularJS foundations for engineering students',
  skills: ['AngularJS'],
  city: 'Mysuru',
  startDate: '2026-11-02',
  endDate: '2026-11-07',
  durationDays: 6,
  audience: '6th sem engineering students',
  travel: 'Provided',
  paymentDueDate: '2026-11-25',
};

describe('RequirementInputSchema', () => {
  it('accepts the Mysuru workshop and fills safe defaults', () => {
    expect(RequirementInputSchema.parse(mysuru)).toMatchObject({
      mode: 'Offline',
      food: 'Unknown',
      budgetMin: null,
      paymentDueDate: '2026-11-25',
    });
  });

  it('rejects an end date before the start date', () => {
    expect(RequirementInputSchema.safeParse({ ...mysuru, endDate: '2026-11-01' }).success).toBe(false);
  });

  it('rejects an inverted budget range', () => {
    expect(RequirementInputSchema.safeParse({ ...mysuru, budgetMin: 5000, budgetMax: 1000 }).success).toBe(false);
  });

  it('requires at least one skill', () => {
    expect(RequirementInputSchema.safeParse({ ...mysuru, skills: [] }).success).toBe(false);
  });
});

describe('CreateRequirementSchema', () => {
  it('saves as a draft unless publish is requested', () => {
    expect(CreateRequirementSchema.parse({ requirement: mysuru }).publish).toBe(false);
  });
});

describe('AddMemberSchema', () => {
  it('accepts a registered account email or phone but rejects a display name', () => {
    expect(AddMemberSchema.safeParse({ identifier: 'vendor@example.com', orgRole: 'recruiter' }).success).toBe(true);
    expect(AddMemberSchema.safeParse({ identifier: '+919876543210', orgRole: 'recruiter' }).success).toBe(true);
    expect(AddMemberSchema.safeParse({ identifier: 'Vikas Gowda J A', orgRole: 'recruiter' }).success).toBe(false);
  });
});

describe('RequirementQuerySchema', () => {
  it('parses query-string booleans and paging', () => {
    expect(RequirementQuerySchema.parse({ repeated: 'true', page: '2' })).toMatchObject({ repeated: true, page: 2, sort: 'newest' });
  });
});

describe('skillKey', () => {
  it('treats spacing and punctuation variants as one skill', () => {
    expect(skillKey('Angular JS')).toBe(skillKey('AngularJS'));
    expect(skillKey('Node.js')).toBe('nodejs');
  });
});

describe('canTransition', () => {
  it('allows pausing and reopening but not reviving a cancelled requirement', () => {
    expect(canTransition('Open', 'Paused')).toBe(true);
    expect(canTransition('Paused', 'Open')).toBe(true);
    expect(canTransition('Cancelled', 'Open')).toBe(false);
  });
});
