import { z } from 'zod';
import {
  DELIVERY_MODES,
  INBOX_STATUSES,
  ORGANIZATION_TYPES,
  ORG_MEMBER_ROLES,
  REQUIREMENT_SORTS,
  REQUIREMENT_STATUSES,
  ROLES,
  SOURCE_TYPES,
  SUPPORT_STATUSES,
  VERIFICATION_STATUSES,
} from './domain.js';

export * from './domain.js';

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullable().default(null);
const IsoDate = z.iso.date();
const PhoneSchema = z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Enter 10-15 digits, optionally starting with +.');

export const RoleSchema = z.enum(ROLES);
// Admin is deliberately missing: admins are created by the seed script, never by sign-up.
export const SelfServiceRoleSchema = RoleSchema.exclude(['Admin']);
export const SupportStatusSchema = z.enum(SUPPORT_STATUSES);
export const DeliveryModeSchema = z.enum(DELIVERY_MODES);
export const RequirementStatusSchema = z.enum(REQUIREMENT_STATUSES);

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

export const OrganizationInputSchema = z.object({
  legalName: text(160).min(2),
  brandName: text(120).default(''),
  type: z.enum(ORGANIZATION_TYPES),
  city: text(80).min(2),
  state: text(80).min(2),
  website: z.url().trim().max(200).nullable().default(null),
  primaryContactName: text(80).min(2),
  email: z.email().trim().toLowerCase().nullable().default(null),
  phone: PhoneSchema.nullable().default(null),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN.')
    .nullable()
    .default(null),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid 10-character PAN.')
    .nullable()
    .default(null),
});

export const VerificationUpdateSchema = z.object({
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  verificationNote: optionalText(300),
});

export const AddMemberSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter the member email or phone.'),
  orgRole: z.enum(ORG_MEMBER_ROLES).default('recruiter'),
});

const RequirementFieldsSchema = z.object({
  title: text(140).min(3),
  description: text(4000).default(''),
  domain: text(80).default(''),
  skills: z.array(text(60).min(1)).min(1, 'Add at least one skill.').max(20),
  city: text(80).min(2),
  state: text(80).default(''),
  mode: DeliveryModeSchema.default('Offline'),
  startDate: IsoDate,
  endDate: IsoDate,
  durationDays: z.number().int().positive().max(365),
  audience: text(160).min(2),
  studentCount: z.number().int().positive().max(100000).nullable().default(null),
  experienceRequired: text(300).default(''),
  budgetMin: z.number().nonnegative().nullable().default(null),
  budgetMax: z.number().nonnegative().nullable().default(null),
  paymentTerms: optionalText(300),
  paymentDueDate: IsoDate.nullable().default(null),
  travel: SupportStatusSchema.default('Unknown'),
  food: SupportStatusSchema.default('Unknown'),
  stay: SupportStatusSchema.default('Unknown'),
});

function checkRequirementRules(
  requirement: { startDate: string; endDate: string; budgetMin: number | null; budgetMax: number | null },
  context: z.RefinementCtx,
): void {
  if (requirement.endDate < requirement.startDate) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be on or after start date.' });
  }
  if (requirement.budgetMin !== null && requirement.budgetMax !== null && requirement.budgetMax < requirement.budgetMin) {
    context.addIssue({ code: 'custom', path: ['budgetMax'], message: 'Maximum budget must be at least the minimum.' });
  }
}

export const RequirementInputSchema = RequirementFieldsSchema.superRefine(checkRequirementRules);

const SourceFieldsSchema = z.object({
  sourceType: z.enum(SOURCE_TYPES).default('Manual'),
  groupName: text(120).default(''),
  rawText: text(8000).default(''),
  postedAt: z.iso.datetime({ offset: true }).or(IsoDate).nullable().default(null),
});

export const SourceInputSchema = SourceFieldsSchema;
export const SourceUpdateSchema = SourceFieldsSchema.partial();

export const CreateRequirementSchema = z.object({
  requirement: RequirementInputSchema,
  /** Publish immediately (Open) or keep as Draft. */
  publish: z.boolean().default(false),
  source: SourceInputSchema.optional(),
  /** Admins may post on behalf of an organization. */
  organizationId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});

export const StatusChangeSchema = z.object({ status: RequirementStatusSchema });

export const GroupRequirementsSchema = z.object({
  requirementIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(2).max(50),
});

const booleanParam = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const RequirementQuerySchema = z.object({
  q: text(100).optional(),
  skill: text(60).optional(),
  city: text(80).optional(),
  vendor: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  startFrom: IsoDate.optional(),
  startTo: IsoDate.optional(),
  status: RequirementStatusSchema.optional(),
  mode: DeliveryModeSchema.optional(),
  repeated: booleanParam,
  hasPaymentDate: booleanParam,
  mine: booleanParam,
  sort: z.enum(REQUIREMENT_SORTS).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const SkillInputSchema = z.object({
  name: text(60).min(1),
  domain: text(80).default(''),
  aliases: z.array(text(60).min(1)).max(20).default([]),
});

export const SkillUpdateSchema = SkillInputSchema.partial().extend({ verified: z.boolean().optional() });

export const ExtractedRequirementSchema = RequirementFieldsSchema.partial();

export const InboxCaptureSchema = z.object({
  rawText: text(20000).min(5, 'Paste the message text.'),
  sourceType: z.enum(SOURCE_TYPES).default('WhatsApp'),
  groupName: text(120).default(''),
  senderName: text(120).default(''),
  receivedAt: z.iso.datetime({ offset: true }).optional(),
  /** Split a WhatsApp chat export into one inbox item per message. */
  splitExport: z.boolean().default(false),
});

export const InboxUpdateSchema = z.object({
  extracted: ExtractedRequirementSchema,
});

export const InboxConvertSchema = z.object({
  requirement: RequirementInputSchema,
  publish: z.boolean().default(true),
  organizationId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});

export const InboxQuerySchema = z.object({
  status: z.enum(INBOX_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type OrganizationInput = z.infer<typeof OrganizationInputSchema>;
export type RequirementInput = z.infer<typeof RequirementInputSchema>;
export type SourceInput = z.infer<typeof SourceInputSchema>;
export type CreateRequirementInput = z.input<typeof CreateRequirementSchema>;
export type RequirementQuery = z.infer<typeof RequirementQuerySchema>;
export type SkillInput = z.infer<typeof SkillInputSchema>;
export type InboxCaptureInput = z.input<typeof InboxCaptureSchema>;
