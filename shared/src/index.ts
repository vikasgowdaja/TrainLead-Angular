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

export const RoleSchema = z.enum(['Admin', 'Vendor', 'Trainer', 'Viewer']);

// Admin is deliberately missing: admins are created by the seed script, never by sign-up.
export const SelfServiceRoleSchema = RoleSchema.exclude(['Admin']);

const PhoneSchema = z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Enter 10-15 digits, optionally starting with +.');

export const RegisterSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.email().trim().toLowerCase().optional(),
    phone: PhoneSchema.optional(),
    password: z.string().min(8, 'Password must be at least 8 characters.').max(72),
    role: SelfServiceRoleSchema,
  })
  .refine((user) => user.email || user.phone, {
    message: 'Provide an email or a phone number.',
    path: ['email'],
  });

export const LoginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or phone.'),
  password: z.string().min(1, 'Enter your password.').max(72),
});

export type Role = z.infer<typeof RoleSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

export type RequirementDraft = z.infer<typeof RequirementDraftSchema>;
export type CreateOpportunity = z.infer<typeof CreateOpportunitySchema>;
export type SupportStatus = z.infer<typeof SupportStatusSchema>;