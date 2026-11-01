import { SOURCE_TYPES } from '@trainlead/shared';
import { Schema, model } from 'mongoose';

const RequirementSourceSchema = new Schema(
  {
    requirementId: { type: Schema.Types.ObjectId, ref: 'Requirement', required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    sourceType: { type: String, enum: SOURCE_TYPES, default: 'Manual' },
    groupName: { type: String, default: '' },
    rawText: { type: String, default: '' },
    postedAt: { type: Date, default: null },
    importedAt: { type: Date, default: () => new Date() },
    inboxItemId: { type: Schema.Types.ObjectId, ref: 'InboxItem', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

export const RequirementSource = model('RequirementSource', RequirementSourceSchema);
