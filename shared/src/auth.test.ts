import { describe, expect, it } from 'vitest';
import { RegisterSchema } from './index.js';

describe('RegisterSchema', () => {
  const base = { name: 'Ananya Rao', password: 'long-enough', role: 'Trainer' as const };

  it('accepts a phone number without an email', () => {
    expect(RegisterSchema.safeParse({ ...base, phone: '+919876543210' }).success).toBe(true);
  });

  it('requires an email or a phone', () => {
    expect(RegisterSchema.safeParse(base).success).toBe(false);
  });

  it('never allows self-registration as Admin', () => {
    expect(RegisterSchema.safeParse({ ...base, email: 'a@b.co', role: 'Admin' }).success).toBe(false);
  });
});
