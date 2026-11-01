import { APPLICATION_STATUSES, INTERVIEW_PROVIDERS } from '@trainlead/shared';
import { Schema, model } from 'mongoose';

const ApplicationSchema = new Schema(
  {
    requirementId: { type: Schema.Types.ObjectId, ref: 'Requirement', required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    trainerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    coverNote: { type: String, default: '' },
    expectedRate: { type: Number, default: null },
    status: { type: String, enum: APPLICATION_STATUSES, default: 'Applied', index: true },
    interviewProvider: { type: String, enum: [...INTERVIEW_PROVIDERS, null], default: null },
    meetingUrl: { type: String, default: null },
    interviewAt: { type: Date, default: null },
    interviewNotes: { type: String, default: '' },
    decisionNote: { type: String, default: null },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

ApplicationSchema.index({ requirementId: 1, trainerId: 1 }, { unique: true });
ApplicationSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
ApplicationSchema.index({ trainerId: 1, createdAt: -1 });

export const Application = model('Application', ApplicationSchema);
