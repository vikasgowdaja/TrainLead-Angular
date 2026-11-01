import { describe, expect, it } from 'vitest';
import { AddMemberSchema, ApplicationDecisionSchema, ApplyToRequirementSchema, CreateRequirementSchema, DemoSlotsUpdateSchema, InterviewScheduleSchema, RequirementInputSchema, RequirementQuerySchema, TrainerProfileUpdateSchema, canTransition, skillKey } from './index.js';

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

describe('TrainerProfileUpdateSchema', () => {
  it('accepts a trainer profile with valid contact details', () => {
    expect(TrainerProfileUpdateSchema.parse({
      name: 'Ananya Rao', email: 'ANANYA@example.com', phone: '+919876543210',
      location: 'Mysuru, Karnataka', skills: ['AngularJS'],
      githubUrl: 'https://github.com/ananya', linkedinUrl: 'https://linkedin.com/in/ananya',
      leetcodeUrl: 'https://leetcode.com/ananya', isPublic: true,
    })).toMatchObject({
      name: 'Ananya Rao', email: 'ananya@example.com', phone: '+919876543210',
      location: 'Mysuru, Karnataka', skills: ['AngularJS'], isPublic: true,
    });
  });

  it('requires at least one account contact method', () => {
    expect(TrainerProfileUpdateSchema.safeParse({ name: 'Ananya Rao', email: null, phone: null }).success).toBe(false);
  });

  it('rejects profile links hosted on unrelated domains', () => {
    expect(TrainerProfileUpdateSchema.safeParse({ name: 'Ananya Rao', email: 'a@b.co', phone: null, githubUrl: 'https://example.com' }).success).toBe(false);
  });
});

describe('application workflow schemas', () => {
  const trainerLinks = {
    skills: ['AngularJS', 'JavaScript'],
    location: 'Mysuru, Karnataka',
    contactPhone: '+919876543210',
    resumeUrl: 'https://drive.google.com/file/d/resume',
    githubUrl: 'https://github.com/trainer',
    linkedinUrl: 'https://www.linkedin.com/in/trainer',
    leetcodeUrl: 'https://leetcode.com/trainer',
  };

  it('requires HTTPS resume and coding profile links', () => {
    expect(ApplyToRequirementSchema.parse({ coverNote: 'AngularJS classroom experience', expectedRate: 4000, ...trainerLinks })).toMatchObject({
      coverNote: 'AngularJS classroom experience', expectedRate: 4000, ...trainerLinks,
    });
    expect(ApplyToRequirementSchema.safeParse({ coverNote: 'No links' }).success).toBe(false);
    expect(ApplyToRequirementSchema.safeParse({ ...trainerLinks, skills: [] }).success).toBe(false);
    expect(ApplyToRequirementSchema.safeParse({ ...trainerLinks, location: '' }).success).toBe(false);
    expect(ApplyToRequirementSchema.safeParse({ ...trainerLinks, contactPhone: 'not-a-phone' }).success).toBe(false);
    expect(ApplyToRequirementSchema.safeParse({ ...trainerLinks, githubUrl: 'https://example.com/trainer' }).success).toBe(false);
  });

  it('accepts only unique future-format demo slot values', () => {
    const slot = { provider: 'Google Meet', meetingUrl: 'https://meet.google.com/abc-defg-hij', scheduledAt: '2026-11-02T09:00:00+05:30' };
    expect(DemoSlotsUpdateSchema.safeParse({ slots: [slot] }).success).toBe(true);
    expect(DemoSlotsUpdateSchema.safeParse({ slots: [slot, slot] }).success).toBe(false);
    expect(DemoSlotsUpdateSchema.safeParse({ slots: [slot, { ...slot, scheduledAt: '2026-11-02T03:30:00Z' }] }).success).toBe(false);
  });

  it('accepts an HTTPS video interview link from the chosen provider', () => {
    expect(InterviewScheduleSchema.safeParse({
      provider: 'Google Meet',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      scheduledAt: '2026-11-02T09:00:00+05:30',
      notes: 'Please join five minutes early.',
    }).success).toBe(true);
    expect(InterviewScheduleSchema.safeParse({
      provider: 'Zoom', meetingUrl: 'https://example.com/meeting', scheduledAt: '2026-11-02T09:00:00Z', notes: '',
    }).success).toBe(false);
  });

  it('only allows accepted or rejected decisions', () => {
    expect(ApplicationDecisionSchema.safeParse({ status: 'Accepted' }).success).toBe(true);
    expect(ApplicationDecisionSchema.safeParse({ status: 'Applied' }).success).toBe(false);
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
    expect(canTransition('Closed', 'Open')).toBe(true);
    expect(canTransition('Cancelled', 'Open')).toBe(false);
  });
});
