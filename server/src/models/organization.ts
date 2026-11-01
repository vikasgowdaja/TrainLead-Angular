import { ORGANIZATION_TYPES, VERIFICATION_STATUSES } from '@trainlead/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

const OrganizationSchema = new Schema(
  {
    legalName: { type: String, required: true, trim: true },
    brandName: { type: String, default: '' },
    // Lower-cased name used to find-or-create organizations when importing posts.
    nameKey: { type: String, required: true, index: true },
    type: { type: String, enum: ORGANIZATION_TYPES, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    website: { type: String, default: null },
    primaryContactName: { type: String, required: true },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    gstin: { type: String, default: null },
    pan: { type: String, default: null },
    verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: 'Pending', index: true },
    verificationNote: { type: String, default: null },
    emailVerifiedAt: { type: Date, default: null },
    emailOtpHash: { type: String, default: null, select: false },
    emailOtpExpiresAt: { type: Date, default: null, select: false },
    emailOtpSentAt: { type: Date, default: null, select: false },
    emailOtpAttempts: { type: Number, default: 0, select: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

export type OrganizationDoc = InferSchemaType<typeof OrganizationSchema> & { _id: import('mongoose').Types.ObjectId };

export function organizationName(organization: { brandName?: string | null; legalName: string }): string {
  return organization.brandName || organization.legalName;
}

export const Organization = model('Organization', OrganizationSchema);
