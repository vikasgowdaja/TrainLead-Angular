import { Router } from 'express';
import { SkillInputSchema, SkillUpdateSchema, skillKey } from '@trainlead/shared';
import { Types } from 'mongoose';
import { requireAuth } from '../auth/middleware.js';
import { actorOf, loadActor } from '../auth/actor.js';
import { forbidden, HttpError, notFound, objectId, parseBody } from '../http.js';
import { Skill } from '../models/skill.js';
import { loadSkillCatalog } from '../services/skills.js';

const router = Router();
router.use(requireAuth, loadActor);

function skillView(skill: { _id: Types.ObjectId; name: string; domain?: string; aliases?: string[]; verified?: boolean }) {
  return {
    id: String(skill._id),
    name: skill.name,
    domain: skill.domain ?? '',
    aliases: skill.aliases ?? [],
    verified: skill.verified ?? false,
  };
}

router.get('/', async (request, response) => {
  const query = typeof request.query['q'] === 'string' ? request.query['q'].trim() : '';
  const skills = await loadSkillCatalog();
  const filtered = query
    ? skills.filter((skill) => [skill.name, ...skill.aliasKeys].some((value) => value.includes(skillKey(query))))
    : skills;
  response.json({ data: filtered.map((skill) => ({ id: skill.key, name: skill.name, domain: '', aliases: skill.aliasKeys, verified: false })) });
});

router.post('/', async (request, response) => {
  const actor = actorOf(request);
  const input = parseBody(SkillInputSchema, request.body, 'skill');
  const key = skillKey(input.name);
  if (!key) throw new HttpError(400, 'Skill name must contain letters or numbers');
  const aliasKeys = [...new Set(input.aliases.map(skillKey).filter((value) => value && value !== key))];
  const existing = await Skill.findOne({ $or: [{ key }, { aliasKeys: key }, { key: { $in: aliasKeys } }, { aliasKeys: { $in: aliasKeys } }] } as never);
  if (existing) {
    response.status(200).json({ data: skillView(existing), existing: true });
    return;
  }
  const skill = await Skill.create({ name: input.name, key, domain: input.domain, aliases: input.aliases, aliasKeys, verified: false, createdBy: actor.userId });
  response.status(201).json({ data: skillView(skill), existing: false });
});

router.put('/:id', async (request, response) => {
  const actor = actorOf(request);
  if (actor.role !== 'Admin') throw forbidden('Only an Admin can edit the verified skill catalog');
  const id = objectId(request.params['id'], 'skill id');
  const input = parseBody(SkillUpdateSchema, request.body, 'skill');
  const current = await Skill.findById(id);
  if (!current) throw notFound('Skill');
  if (input.name) {
    current.name = input.name;
    current.key = skillKey(input.name);
  }
  if (input.domain !== undefined) current.domain = input.domain;
  if (input.aliases !== undefined) {
    current.aliases = input.aliases;
    current.aliasKeys = [...new Set(input.aliases.map(skillKey).filter((key) => key && key !== current.key))];
  }
  if (input.verified !== undefined) current.verified = input.verified;
  try {
    await current.save();
  } catch (error) {
    if (typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000) {
      throw new HttpError(409, 'That canonical skill already exists');
    }
    throw error;
  }
  response.json({ data: skillView(current) });
});

export { router as skillsRouter };
