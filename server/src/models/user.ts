import { ORG_MEMBER_ROLES, RoleSchema } from '@trainlead/shared';
import { Schema, model } from 'mongoose';

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    photoUrl: { type: String, default: null },
    photoPublicId: { type: String, default: null },
    resumeUrl: { type: String, default: null },
    resumePublicId: { type: String, default: null },
    resumeFileName: { type: String, default: null },
    location: { type: String, default: '' },
    skills: { type: [String], default: [] },
    expectedRate: { type: Number, default: null },
    githubUrl: { type: String, default: null },
    linkedinUrl: { type: String, default: null },
    leetcodeUrl: { type: String, default: null },
    isPublic: { type: Boolean, default: false },
    publicSlug: { type: String, default: null },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: RoleSchema.options, required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    orgRole: { type: String, enum: [...ORG_MEMBER_ROLES, null], default: null },
    // Only the newest refresh token is valid; rotating this id revokes older ones.
    refreshTokenId: { type: String, default: null, select: false },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

UserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
UserSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
UserSchema.index({ publicSlug: 1 }, { unique: true, partialFilterExpression: { publicSlug: { $type: 'string' } } });

export const User = model('User', UserSchema);
