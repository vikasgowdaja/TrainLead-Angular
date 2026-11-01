import { z } from 'zod';
import {
  APPLICATION_STATUSES,
  DELIVERY_MODES,
  INTERVIEW_PROVIDERS,
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
export const ApplicationStatusSchema = z.enum(APPLICATION_STATUSES);
export const InterviewProviderSchema = z.enum(INTERVIEW_PROVIDERS);

function isHttpsUrl(value: string): boolean {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

function serviceUrl(hosts: string[], label: string) {
  return z.url().trim().max(500).refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && hosts.includes(url.hostname.toLowerCase());
    } catch { return false; }
  }, `Enter a valid HTTPS ${label} profile link.`);
}

const ResumeUrlSchema = z.url().trim().max(500).refine(isHttpsUrl, 'Enter an HTTPS resume link.');
const GitHubUrlSchema = serviceUrl(['github.com', 'www.github.com'], 'GitHub');
const LinkedInUrlSchema = serviceUrl(['linkedin.com', 'www.linkedin.com'], 'LinkedIn');
const LeetCodeUrlSchema = serviceUrl(['leetcode.com', 'www.leetcode.com'], 'LeetCode');
const PublicAssetUrlSchema = z.string().trim().max(1000).url().refine(isHttpsUrl, 'Enter a public HTTPS URL.').nullable().default(null);

export const TrainerPortfolioItemSchema = z.object({
  title: text(100).min(1),
  description: text(500).default(''),
  imageUrl: PublicAssetUrlSchema,
  videoUrl: PublicAssetUrlSchema,
  projectUrl: PublicAssetUrlSchema,
}).superRefine(({ imageUrl, videoUrl, projectUrl }, context) => {
  if (!imageUrl && !videoUrl && !projectUrl) {
    context.addIssue({ code: 'custom', message: 'Add an image, video, or project link.', path: ['imageUrl'] });
  }
});

export const TrainerCertificationSchema = z.object({
  name: text(120).min(2),
  issuer: text(120).default(''),
  issuedDate: IsoDate.nullable().default(null),
  credentialUrl: z.string().trim().max(1000).url().refine(isHttpsUrl, 'Enter a public HTTPS credential URL.'),
});

function matchesMeetingProvider(value: string, provider: (typeof INTERVIEW_PROVIDERS)[number]): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (provider === 'Google Meet') return host === 'meet.google.com';
    if (provider === 'Zoom') return host === 'zoom.us' || host.endsWith('.zoom.us');
    return host === 'teams.microsoft.com' || host.endsWith('.teams.microsoft.com') || host === 'teams.live.com';
  } catch { return false; }
}

const MeetingUrlSchema = z.url().refine((value) => INTERVIEW_PROVIDERS.some((provider) => matchesMeetingProvider(value, provider)), 'Enter an HTTPS Google Meet, Zoom, or Teams link.');

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

export const TrainerProfileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().trim().toLowerCase().nullable().default(null),
  phone: PhoneSchema.nullable().default(null),
  location: text(120).nullable().default(null),
  skills: z.array(text(60).min(1)).max(20).default([]),
  expectedRate: z.number().nonnegative().nullable().default(null),
  githubUrl: GitHubUrlSchema.nullable().default(null),
  linkedinUrl: LinkedInUrlSchema.nullable().default(null),
  leetcodeUrl: LeetCodeUrlSchema.nullable().default(null),
  bio: text(1000).default(''),
  portfolioItems: z.array(TrainerPortfolioItemSchema).max(8).default([]),
  certifications: z.array(TrainerCertificationSchema).max(20).default([]),
  isPublic: z.boolean().default(false),
}).refine((profile) => profile.email || profile.phone, {
  message: 'Provide an email address or phone number.',
  path: ['email'],
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

export const EmailOtpVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
});

export const AddMemberSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter the member email or phone.').refine(
    (value) => value.includes('@') ? z.email().safeParse(value).success : PhoneSchema.safeParse(value).success,
    'Enter an email address or 10-15 digit phone number, not a name.',
  ),
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

export const SmartExtractionRequestSchema = z.object({
  input: text(20000).min(5, 'Add requirement details before extraction.'),
  inputType: z.enum(['text', 'table']).default('text'),
});

const SourceFieldsSchema = z.object({
  sourceType: z.enum(SOURCE_TYPES).default('Manual'),
  groupName: text(120).default(''),
  rawText: text(20000).default(''),
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

export const ApplyToRequirementSchema = z.object({
  coverNote: text(2000).default(''),
  expectedRate: z.number().nonnegative().nullable().default(null),
  skills: z.array(text(60).min(1)).min(1, 'Add at least one relevant skill.').max(20),
  location: text(120).min(2, 'Enter your city or location.'),
  contactPhone: PhoneSchema,
  resumeUrl: ResumeUrlSchema,
  githubUrl: GitHubUrlSchema,
  linkedinUrl: LinkedInUrlSchema,
  leetcodeUrl: LeetCodeUrlSchema,
});

export const DemoSlotSchema = z.object({
  provider: InterviewProviderSchema,
  meetingUrl: z.url(),
  scheduledAt: z.iso.datetime({ offset: true }),
}).superRefine(({ provider, meetingUrl }, context) => {
  if (!matchesMeetingProvider(meetingUrl, provider)) context.addIssue({ code: 'custom', path: ['meetingUrl'], message: 'Enter an HTTPS meeting link for the selected provider.' });
});

export const DemoSlotsUpdateSchema = z.object({
  slots: z.array(DemoSlotSchema).max(20),
}).superRefine(({ slots }, context) => {
  const times = new Set<number>();
  slots.forEach((slot, index) => {
    const time = new Date(slot.scheduledAt).getTime();
    if (times.has(time)) context.addIssue({ code: 'custom', path: ['slots', index, 'scheduledAt'], message: 'Each demo slot must have a unique date and time.' });
    times.add(time);
  });
});

export const BookDemoSlotSchema = z.object({ scheduledAt: z.iso.datetime({ offset: true }) });

export const InterviewScheduleSchema = z.object({
  provider: InterviewProviderSchema,
  meetingUrl: z.url(),
  scheduledAt: z.iso.datetime({ offset: true }),
  notes: text(500).default(''),
}).superRefine(({ provider, meetingUrl }, context) => {
  if (!matchesMeetingProvider(meetingUrl, provider)) context.addIssue({ code: 'custom', path: ['meetingUrl'], message: 'Enter an HTTPS meeting link for the selected provider.' });
});

export const ApplicationDecisionSchema = z.object({
  status: z.enum(['Accepted', 'Rejected', 'OnHold']),
  decisionNote: optionalText(500),
});

export const TrainerProjectReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: optionalText(1000),
});

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
  endFrom: IsoDate.optional(),
  endTo: IsoDate.optional(),
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
export type TrainerProfileUpdateInput = z.input<typeof TrainerProfileUpdateSchema>;
export type ApplyToRequirementInput = z.input<typeof ApplyToRequirementSchema>;
export type DemoSlotInput = z.input<typeof DemoSlotSchema>;
export type DemoSlotsUpdateInput = z.input<typeof DemoSlotsUpdateSchema>;
export type BookDemoSlotInput = z.input<typeof BookDemoSlotSchema>;
export type InterviewScheduleInput = z.input<typeof InterviewScheduleSchema>;
export type ApplicationDecision = z.input<typeof ApplicationDecisionSchema>;
export type OrganizationInput = z.infer<typeof OrganizationInputSchema>;
export type RequirementInput = z.infer<typeof RequirementInputSchema>;
export type SmartExtractionRequest = z.input<typeof SmartExtractionRequestSchema>;
export type SourceInput = z.infer<typeof SourceInputSchema>;
export type CreateRequirementInput = z.input<typeof CreateRequirementSchema>;
export type RequirementQuery = z.infer<typeof RequirementQuerySchema>;
export type SkillInput = z.infer<typeof SkillInputSchema>;
export type InboxCaptureInput = z.input<typeof InboxCaptureSchema>;
