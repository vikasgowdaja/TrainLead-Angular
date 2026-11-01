import { APPLICATION_STATUSES, INTERVIEW_PROVIDERS } from '@trainlead/shared';
import { Schema, model } from 'mongoose';

const ApplicationSchema = new Schema(
  {
    requirementId: { type: Schema.Types.ObjectId, ref: 'Requirement', required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    trainerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    coverNote: { type: String, default: '' },
    expectedRate: { type: Number, default: null },
    skills: { type: [String], default: [] },
    location: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    resumeUrl: { type: String, default: '' },
    githubUrl: { type: String, default: '' },
    linkedinUrl: { type: String, default: '' },
    leetcodeUrl: { type: String, default: '' },
    status: { type: String, enum: APPLICATION_STATUSES, default: 'Applied', index: true },
    interviewProvider: { type: String, enum: [...INTERVIEW_PROVIDERS, null], default: null },
    meetingUrl: { type: String, default: null },
    interviewAt: { type: Date, default: null },
    interviewNotes: { type: String, default: '' },
    demoSlotAt: { type: Date, default: null },
    decisionNote: { type: String, default: null },
    trainerRating: { type: Number, min: 1, max: 5, default: null },
    trainerReview: { type: String, maxlength: 1000, default: null },
    trainerReviewedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

ApplicationSchema.index({ requirementId: 1, trainerId: 1 }, { unique: true });
ApplicationSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
ApplicationSchema.index({ trainerId: 1, createdAt: -1 });
ApplicationSchema.index({ requirementId: 1, demoSlotAt: 1 }, { unique: true, partialFilterExpression: { demoSlotAt: { $type: 'date' } } });

export const Application = model('Application', ApplicationSchema);
