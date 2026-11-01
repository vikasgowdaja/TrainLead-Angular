import { DELIVERY_MODES, INTERVIEW_PROVIDERS, REQUIREMENT_STATUSES, SUPPORT_STATUSES } from '@trainlead/shared';
import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

interface RequirementRecord {
  organizationId: Types.ObjectId;
  createdBy: Types.ObjectId | null;
  title: string;
  description: string;
  domain: string;
  skillIds: Types.ObjectId[];
  skillNames: string[];
  skillKeys: string[];
  city: string;
  state: string;
  mode: (typeof DELIVERY_MODES)[number];
  startDate: Date;
  endDate: Date;
  durationDays: number;
  audience: string;
  studentCount: number | null;
  experienceRequired: string;
  budgetMin: number | null;
  budgetMax: number | null;
  paymentTerms: string | null;
  paymentDueDate: Date | null;
  travel: (typeof SUPPORT_STATUSES)[number];
  food: (typeof SUPPORT_STATUSES)[number];
  stay: (typeof SUPPORT_STATUSES)[number];
  demoSlots: { provider: (typeof INTERVIEW_PROVIDERS)[number]; meetingUrl: string; scheduledAt: Date }[];
  status: (typeof REQUIREMENT_STATUSES)[number];
  publishedAt: Date | null;
  matchKey: string;
  groupId: Types.ObjectId | null;
  autoGroupOptOut: boolean;
  deletedAt: Date | null;
}

const RequirementSchema = new Schema<RequirementRecord>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    domain: { type: String, default: '' },
    skillIds: { type: [Schema.Types.ObjectId], ref: 'Skill', default: [] },
    skillNames: { type: [String], default: [] },
    skillKeys: { type: [String], default: [], index: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, default: '' },
    mode: { type: String, enum: DELIVERY_MODES, required: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true },
    durationDays: { type: Number, required: true },
    audience: { type: String, required: true },
    studentCount: { type: Number, default: null },
    experienceRequired: { type: String, default: '' },
    budgetMin: { type: Number, default: null },
    budgetMax: { type: Number, default: null },
    paymentTerms: { type: String, default: null },
    paymentDueDate: { type: Date, default: null },
    travel: { type: String, enum: SUPPORT_STATUSES, default: 'Unknown' },
    food: { type: String, enum: SUPPORT_STATUSES, default: 'Unknown' },
    stay: { type: String, enum: SUPPORT_STATUSES, default: 'Unknown' },
    demoSlots: {
      type: [{ provider: { type: String, enum: INTERVIEW_PROVIDERS, required: true }, meetingUrl: { type: String, required: true }, scheduledAt: { type: Date, required: true } }],
      default: [],
    },
    status: { type: String, enum: REQUIREMENT_STATUSES, default: 'Draft', index: true },
    publishedAt: { type: Date, default: null },
    // city|start|end; requirements sharing it (and a skill) are candidates for the same opportunity.
    matchKey: { type: String, required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'RequirementGroup', default: null, index: true },
    // Set when someone ungroups by hand, so automatic grouping does not undo their decision.
    autoGroupOptOut: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

RequirementSchema.index({ deletedAt: 1, status: 1, createdAt: -1 });
RequirementSchema.index({ city: 1, startDate: 1 });
RequirementSchema.index({ organizationId: 1, status: 1 });

export type RequirementDoc = HydratedDocument<RequirementRecord>;

export const Requirement = model<RequirementRecord>('Requirement', RequirementSchema);
