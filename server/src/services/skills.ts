import { skillKey } from '@trainlead/shared';
import type { ClientSession, Types } from 'mongoose';
import { Skill } from '../models/skill.js';

export interface ResolvedSkills {
  ids: Types.ObjectId[];
  names: string[];
  keys: string[];
}

export interface SkillCatalogEntry {
  name: string;
  key: string;
  aliasKeys: string[];
}

/** Maps names (including aliases such as "Angular JS") to canonical skills, creating unknown ones as unverified. */
export async function resolveSkills(
  rawNames: string[],
  createdBy: Types.ObjectId | null,
  session?: ClientSession,
): Promise<ResolvedSkills> {
  const wanted = [...new Map(rawNames.map((name) => [skillKey(name), name.trim()])).entries()].filter(([key]) => key);
  const keys = wanted.map(([key]) => key);
  const existing = await Skill.find({ $or: [{ key: { $in: keys } }, { aliasKeys: { $in: keys } }] }, null, { session });

  const resolved = new Map<string, { _id: Types.ObjectId; name: string; key: string }>();
  for (const [key, name] of wanted) {
    let skill = existing.find((candidate) => candidate.key === key || candidate.aliasKeys.includes(key));
    if (!skill) {
      // Upsert on the unique key so two concurrent requests cannot create the same skill twice.
      skill = await Skill.findOneAndUpdate(
        { key },
        { $setOnInsert: { name, key, createdBy } },
        { upsert: true, new: true, session },
      );
    }
    if (!skill) {
      throw new Error('Could not resolve skill after upsert.');
    }
    resolved.set(skill.key, { _id: skill._id, name: skill.name, key: skill.key });
  }

  const skills = [...resolved.values()];
  return { ids: skills.map((s) => s._id), names: skills.map((s) => s.name), keys: skills.map((s) => s.key) };
}

/** Finds the canonical key for a filter value, so filtering by "Angular JS" also finds "AngularJS". */
export async function canonicalSkillKey(name: string): Promise<string> {
  const key = skillKey(name);
  const skill = await Skill.findOne({ $or: [{ key }, { aliasKeys: key }] }).select('key').lean();
  return skill?.key ?? key;
}

export async function loadSkillCatalog(): Promise<SkillCatalogEntry[]> {
  return Skill.find().select('name key aliasKeys').lean();
}
