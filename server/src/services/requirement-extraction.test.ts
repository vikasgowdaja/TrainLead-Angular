import { describe, expect, it } from 'vitest';
import { extractRequirement } from './requirement-extraction.js';

const mtdMessage = `Namaste from MTD

Duration: 6 days
Subject: AngularJS
Start Date: 2nd Nov
End Date: 7th Nov
Commercial: 4000/day (No TDS Cut)
TFA Provided
Payment Date: 25th Nov
Location: Mysuru
Participants: 6th Sem Engg Students

Contact: MTD NITHIN
9480273090`;

describe('smart requirement extraction', () => {
  it('maps the MTD WhatsApp message without inventing mode or student count', () => {
    const result = extractRequirement(mtdMessage, 'text', new Date('2026-11-01T00:00:00Z'));

    expect(result.extracted).toMatchObject({
      title: 'AngularJS Training for 6th Semester Engineering Students',
      domain: 'Web Development',
      skills: ['AngularJS'],
      city: 'Mysuru',
      state: 'Karnataka',
      startDate: '2026-11-02',
      endDate: '2026-11-07',
      durationDays: 6,
      audience: '6th Semester Engineering Students',
      budgetMin: 4000,
      budgetMax: 4000,
      paymentDueDate: '2026-11-25',
      travel: 'Provided',
      food: 'Provided',
      stay: 'Provided',
    });
    expect(result.extracted.mode).toBeUndefined();
    expect(result.extracted.studentCount).toBeUndefined();
    expect(result.sourceDetails).toEqual({ organizationName: 'MTD', contactPerson: 'Nithin', phone: '9480273090', email: null });
    expect(result.estimatedTotalBudget).toBe(24000);
    expect(result.missingFields).toContain('mode');
  });

  it('maps daily budget columns from tab-separated tables', () => {
    const result = extractRequirement('Title\tSubject\tLocation\tStart Date\tEnd Date\tDuration\tDaily Budget\tPayment Date\nAngularJS Training\tAngularJS\tMysuru\t02-11-2026\t07-11-2026\t6\t4000\t25-11-2026', 'table', new Date('2026-11-01T00:00:00Z'));

    expect(result.extracted).toMatchObject({
      title: 'AngularJS Training', skills: ['AngularJS'], city: 'Mysuru', state: 'Karnataka',
      startDate: '2026-11-02', endDate: '2026-11-07', durationDays: 6,
      budgetMin: 4000, budgetMax: 4000, paymentDueDate: '2026-11-25',
    });
    expect(result.estimatedTotalBudget).toBe(24000);
    expect(result.extracted.mode).toBeUndefined();
  });

  it('corrects the common screenshot OCR substitution for AngularJS', () => {
    const result = extractRequirement('Subject: AngulardS\nDuration: 6 days\nLocation: Mysuru\nParticipants: 6th Sem Engg Students', 'text', new Date('2026-11-01T00:00:00Z'));
    expect(result.extracted.skills).toContain('AngularJS');
    expect(result.extracted.studentCount).toBeUndefined();
  });
});
