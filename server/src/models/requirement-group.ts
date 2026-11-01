import { Schema, model } from 'mongoose';

// Members are the requirements whose groupId points here; a group always has two or more.
const RequirementGroupSchema = new Schema(
  {
    reason: { type: String, enum: ['auto', 'manual'], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const RequirementGroup = model('RequirementGroup', RequirementGroupSchema);
