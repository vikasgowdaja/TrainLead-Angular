import { Schema, model } from 'mongoose';
import type { RequirementDraft } from '@trainlead/shared';

const OpportunitySchema = new Schema(
  {
    dedupeKey: { type: String, required: true, unique: true, index: true },
    technologyStack: { type: [String], required: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true },
    durationDays: { type: Number, required: true },
    college: { type: String, default: null },
    city: { type: String, required: true, index: true },
    mode: { type: String, required: true },
    audience: { type: String, required: true },
    travel: { type: String, required: true },
    food: { type: String, required: true },
    stay: { type: String, required: true },
    tfa: { type: String, required: true },
    summary: { type: String, required: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

OpportunitySchema.index({ city: 1, startDate: 1 });

export const Opportunity = model<RequirementDraft & { deletedAt: Date | null }>(
  'Opportunity',
  OpportunitySchema,
);