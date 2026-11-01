import { Schema, model } from 'mongoose';

const SkillSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // skillKey(name): "Angular JS" and "AngularJS" share one key, so they cannot become two skills.
    key: { type: String, required: true, unique: true },
    domain: { type: String, default: '' },
    aliases: { type: [String], default: [] },
    aliasKeys: { type: [String], default: [], index: true },
    verified: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const Skill = model('Skill', SkillSchema);
