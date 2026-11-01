// Plain constants and types only (no Zod) so the Angular client can import values cheaply.

export const ROLES = ['Admin', 'Vendor', 'Trainer', 'Viewer'] as const;
export const SUPPORT_STATUSES = ['Provided', 'Reimbursed', 'Not provided', 'Unknown'] as const;
export const DELIVERY_MODES = ['Offline', 'Online', 'Hybrid'] as const;
export const REQUIREMENT_STATUSES = ['Draft', 'Open', 'Paused', 'Filled', 'Closed', 'Cancelled'] as const;
export const ORGANIZATION_TYPES = ['Training company', 'College', 'Corporate', 'Individual'] as const;
export const VERIFICATION_STATUSES = ['Draft', 'Pending', 'Verified', 'Rejected'] as const;
export const ORG_MEMBER_ROLES = ['owner', 'recruiter'] as const;
export const SOURCE_TYPES = ['Manual', 'WhatsApp', 'Email', 'Import'] as const;
export const INBOX_STATUSES = ['Pending', 'Extracted', 'Failed', 'Converted', 'Discarded'] as const;
export const REQUIREMENT_SORTS = ['newest', 'oldest', 'upcoming', 'updated', 'start'] as const;
export const APPLICATION_STATUSES = ['Applied', 'InterviewScheduled', 'Accepted', 'Rejected', 'Withdrawn'] as const;
export const INTERVIEW_PROVIDERS = ['Google Meet', 'Zoom', 'Microsoft Teams'] as const;

export type Role = (typeof ROLES)[number];
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export type DeliveryMode = (typeof DELIVERY_MODES)[number];
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export type OrgMemberRole = (typeof ORG_MEMBER_ROLES)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type InboxStatus = (typeof INBOX_STATUSES)[number];
export type RequirementSort = (typeof REQUIREMENT_SORTS)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type InterviewProvider = (typeof INTERVIEW_PROVIDERS)[number];

export interface DemoSlotView {
  provider: InterviewProvider;
  meetingUrl: string | null;
  scheduledAt: string;
  available: boolean;
  booked: boolean;
}

export const STATUS_TRANSITIONS: Record<RequirementStatus, readonly RequirementStatus[]> = {
  Draft: ['Open', 'Cancelled'],
  Open: ['Paused', 'Filled', 'Closed', 'Cancelled'],
  Paused: ['Open', 'Closed', 'Cancelled'],
  Filled: ['Open', 'Closed'],
  Closed: ['Open'],
  Cancelled: [],
};

export function canTransition(from: RequirementStatus, to: RequirementStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

/** "Angular JS", "angular.js" and "AngularJS" all become "angularjs". */
export function skillKey(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/[\s._-]+/g, '');
}

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  organizationId?: string | null;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

export interface Page<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface VendorRef {
  id: string;
  name: string;
}

export interface RequirementSummary {
  id: string;
  title: string;
  skills: string[];
  city: string;
  state: string;
  mode: DeliveryMode;
  startDate: string;
  endDate: string;
  durationDays: number;
  audience: string;
  studentCount: number | null;
  travel: SupportStatus;
  food: SupportStatus;
  stay: SupportStatus;
  paymentDueDate: string | null;
  status: RequirementStatus;
  organization: VendorRef;
  groupId: string | null;
  /** Requirements (one per vendor post) describing this same opportunity. */
  groupSize: number;
  sourceCount: number;
  pendingApplications: number;
  vendors: VendorRef[];
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SourceView {
  id: string;
  requirementId: string;
  sourceType: SourceType;
  groupName: string;
  postedAt: string | null;
  importedAt: string;
  organization: VendorRef;
  /** Null when the viewer may not see the original message (it can contain phone numbers). */
  rawText: string | null;
  canManage: boolean;
}

export interface GroupMemberView {
  id: string;
  title: string;
  status: RequirementStatus;
  organization: VendorRef;
}

export interface OrganizationPublicView {
  id: string;
  name: string;
  legalName: string;
  type: OrganizationType;
  city: string;
  state: string;
  website: string | null;
  verificationStatus: VerificationStatus;
}

export interface OrganizationView extends OrganizationPublicView {
  brandName: string;
  primaryContactName: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  gstin: string | null;
  pan: string | null;
  verificationNote: string | null;
  myRole: OrgMemberRole | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMemberView {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  orgRole: OrgMemberRole;
}

export interface RequirementDetail extends RequirementSummary {
  description: string;
  domain: string;
  experienceRequired: string;
  /** Rates and payment terms are only shown to the posting organization and admins. */
  budgetMin: number | null;
  budgetMax: number | null;
  paymentTerms: string | null;
  organizationDetail: OrganizationPublicView & { contact: { name: string; email: string | null; phone: string | null } | null };
  sources: SourceView[];
  groupMembers: GroupMemberView[];
  demoSlots: DemoSlotView[];
  allowedStatuses: RequirementStatus[];
}

export interface ApplicationView {
  id: string;
  requirement: { id: string; title: string; city: string; startDate: string; endDate: string };
  trainer: {
    id: string;
    name: string;
    skills: string[];
    email: string | null;
    phone: string | null;
    profileLinks: { resume: string; github: string; linkedin: string; leetcode: string };
  };
  coverNote: string;
  expectedRate: number | null;
  status: ApplicationStatus;
  interview: { provider: InterviewProvider; meetingUrl: string; scheduledAt: string; notes: string } | null;
  decisionNote: string | null;
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationNotificationView {
  applicationId: string;
  requirementId: string;
  requirementTitle: string;
  trainerName: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  activeOpportunities: number;
  openOpportunities: number;
  newThisWeek: number;
  repeatedGroups: number;
  withPaymentDate: number;
  vendors: number;
  sourcePosts: number;
  inboxPending: number;
  lastUpdatedAt: string | null;
  topVendors: (VendorRef & { sourceCount: number })[];
}

export interface AdminAnalytics {
  trainerAccounts: number;
  vendorAccounts: number;
  organizations: number;
  verifiedOrganizations: number;
  totalRequirements: number;
  totalOpportunities: number;
  activeOpportunities: number;
  requirementsByStatus: Record<RequirementStatus, number>;
  sourcePosts: number;
  inboxPending: number;
  lastUpdatedAt: string | null;
}

export interface SkillView {
  id: string;
  name: string;
  domain: string;
  aliases: string[];
  verified: boolean;
}

export interface ExtractedRequirement {
  title?: string | null;
  description?: string | null;
  domain?: string | null;
  skills?: string[];
  city?: string | null;
  state?: string | null;
  mode?: DeliveryMode | null;
  startDate?: string | null;
  endDate?: string | null;
  durationDays?: number | null;
  audience?: string | null;
  studentCount?: number | null;
  experienceRequired?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  paymentTerms?: string | null;
  paymentDueDate?: string | null;
  travel?: SupportStatus | null;
  food?: SupportStatus | null;
  stay?: SupportStatus | null;
}

export type ExtractionConfidence = 'high' | 'medium' | 'low';

export interface SmartExtractionResult {
  extracted: ExtractedRequirement;
  sourceDetails: {
    organizationName: string | null;
    contactPerson: string | null;
    phone: string | null;
    email: string | null;
  };
  extractedText: string;
  missingFields: string[];
  warnings: string[];
  confidence: Record<string, ExtractionConfidence>;
  estimatedTotalBudget: number | null;
}

export interface InboxItemView {
  id: string;
  rawText: string;
  sourceType: SourceType;
  groupName: string;
  senderName: string;
  receivedAt: string;
  status: InboxStatus;
  error: string | null;
  extracted: ExtractedRequirement;
  missingFields: string[];
  requirementId: string | null;
  organization: VendorRef | null;
  createdAt: string;
}
