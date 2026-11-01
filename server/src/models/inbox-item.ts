import { INBOX_STATUSES, SOURCE_TYPES } from '@trainlead/shared';
import { Schema, model } from 'mongoose';

const InboxItemSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rawText: { type: String, required: true },
    sourceType: { type: String, enum: SOURCE_TYPES, default: 'WhatsApp' },
    groupName: { type: String, default: '' },
    senderName: { type: String, default: '' },
    receivedAt: { type: Date, default: () => new Date() },
    status: { type: String, enum: INBOX_STATUSES, default: 'Pending', index: true },
    error: { type: String, default: null },
    extracted: { type: Schema.Types.Mixed, default: {} },
    missingFields: { type: [String], default: [] },
    attempts: { type: Number, default: 0 },
    requirementId: { type: Schema.Types.ObjectId, ref: 'Requirement', default: null },
  },
  { timestamps: true, minimize: false },
);

InboxItemSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

export const InboxItem = model('InboxItem', InboxItemSchema);
