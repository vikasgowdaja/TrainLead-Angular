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
  college: z.string().trim().nullable().default(null),
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
  sourceGroup: z.string().trim().nullable().default(null),
  summary: z.string().trim().min(1),
}).superRefine((requirement, context) => {
  if (requirement.endDate < requirement.startDate) {
    context.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'End date must be on or after start date.',
    });
  }
});

export const CreateOpportunitySchema = z.object({
  requirement: RequirementDraftSchema,
  posting: z.object({
    sourceName: z.string().trim().min(1),
    groupName: z.string().trim().min(1),
    rate: z.number().nonnegative().nullable().default(null),
    paymentDate: z.iso.date().nullable().default(null),
    vendorPhone: z.string().trim().nullable().default(null),
  }),
});

export type RequirementDraft = z.infer<typeof RequirementDraftSchema>;
export type CreateOpportunity = z.infer<typeof CreateOpportunitySchema>;
export type SupportStatus = z.infer<typeof SupportStatusSchema>;