import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import { HttpError } from '../http.js';

export const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
export const EMAIL_OTP_RESEND_MS = 60 * 1000;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;

function gmailConfig(): { user: string; appPassword: string } {
  const user = process.env['GMAIL_USER']?.trim();
  const appPassword = process.env['GMAIL_APP_PASSWORD']?.replace(/\s/g, '');
  if (!user || !appPassword) {
    throw new HttpError(503, 'Email verification is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.');
  }
  return { user, appPassword };
}

export function createEmailOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function emailOtpDigest(organizationId: string, code: string): string {
  const { appPassword } = gmailConfig();
  const key = process.env['EMAIL_OTP_SECRET'] || process.env['JWT_REFRESH_SECRET'] || appPassword;
  return createHmac('sha256', key).update(`${organizationId}:${code}`).digest('hex');
}

export function matchesEmailOtp(organizationId: string, code: string, storedDigest: string): boolean {
  const actual = Buffer.from(emailOtpDigest(organizationId, code), 'hex');
  const expected = Buffer.from(storedDigest, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function sendOrganizationEmailOtp(to: string, code: string): Promise<void> {
  const { user, appPassword } = gmailConfig();
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: appPassword },
  });
  await transporter.sendMail({
    from: process.env['GMAIL_FROM']?.trim() || user,
    to,
    subject: 'TrainLead organization email verification',
    text: `Your TrainLead email verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
  });
}
