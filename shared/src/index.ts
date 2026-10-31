import { z } from 'zod';

export const SupportStatusSchema = z.enum([
  'Provided',
  'Reimbursed',
  'Not provided',
  'Unknown',
]);

export const RequirementDraftSchema = z.object({
  technologyStack: z.array(z.string().trim().min(1)).min(1),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  durationDays: z.number().int().positive(),
  college: z.string().trim().min(1),
  city: z.string().trim().min(1),
  mode: z.enum(['Online', 'On-site', 'Hybrid', 'Unknown']).default('Unknown'),
  audience: z.string().trim().min(1),
  travel: SupportStatusSchema.default('Unknown'),
  food: SupportStatusSchema.default('Unknown'),
  stay: SupportStatusSchema.default('Unknown'),
  tfa: SupportStatusSchema.default('Unknown'),
  rate: z.number().nonnegative().nullable().default(null),
  paymentDate: z.iso.date().nullable().default(null),
  vendorName: z.string().trim().nullable().default(null),
  vendorCompany: z.string().trim().nullable().default(null),
  vendorPhone: z.string().trim().nullable().default(null),
  summary: z.string().trim().min(1),
});

export type RequirementDraft = z.infer<typeof RequirementDraftSchema>;
export type SupportStatus = z.infer<typeof SupportStatusSchema>;