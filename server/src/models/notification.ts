import type { TrainerNotificationKind } from '@trainlead/shared/domain';
import { Schema, model } from 'mongoose';

const NotificationSchema = new Schema(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['NewRequirement', 'ApplicationUpdate', 'ProjectRating'], required: true },
    requirementId: { type: Schema.Types.ObjectId, ref: 'Requirement', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', default: null },
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 500 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

NotificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });

export const Notification = model('Notification', NotificationSchema);
export type NotificationKind = TrainerNotificationKind;