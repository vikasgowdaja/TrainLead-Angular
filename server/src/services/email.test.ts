import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmailOtp, emailOtpDigest, matchesEmailOtp } from './email.js';

describe('organization email OTP', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('creates a six-digit code and matches only the correct organization and code', () => {
    vi.stubEnv('GMAIL_USER', 'sender@example.test');
    vi.stubEnv('GMAIL_APP_PASSWORD', 'test-app-password');
    const code = createEmailOtp();
    const digest = emailOtpDigest('organization-1', code);

    expect(code).toMatch(/^\d{6}$/);
    expect(matchesEmailOtp('organization-1', code, digest)).toBe(true);
    expect(matchesEmailOtp('organization-2', code, digest)).toBe(false);
    expect(matchesEmailOtp('organization-1', '000000', digest)).toBe(code === '000000');
  });

  it('requires Gmail transport configuration before hashing codes', () => {
    vi.stubEnv('GMAIL_USER', '');
    vi.stubEnv('GMAIL_APP_PASSWORD', '');

    expect(() => emailOtpDigest('organization-1', '123456')).toThrow('Email verification is not configured');
  });
});
