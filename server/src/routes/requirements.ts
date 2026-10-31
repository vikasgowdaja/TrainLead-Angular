import { Router } from 'express';
import { CreateOpportunitySchema, RequirementDraftSchema } from '@trainlead/shared';
import { Types } from 'mongoose';
import { Opportunity } from '../models/opportunity.js';
import { Posting } from '../models/posting.js';
import { createOpportunityKey } from '../requirements/dedupe.js';

const router = Router();
const publicFields = 'technologyStack startDate endDate durationDays college city mode audience travel food stay tfa summary createdAt';

function presentOpportunity(opportunity: Record<string, unknown>, postingCount: number, sources: string[], groups: string[]) {
  return {
    id: String(opportunity['_id']),
    technologyStack: opportunity['technologyStack'],
    startDate: opportunity['startDate'],
    endDate: opportunity['endDate'],
    durationDays: opportunity['durationDays'],
    college: opportunity['college'],
    city: opportunity['city'],
    mode: opportunity['mode'],
    audience: opportunity['audience'],
    travel: opportunity['travel'],
    food: opportunity['food'],
    stay: opportunity['stay'],
    tfa: opportunity['tfa'],
    summary: opportunity['summary'],
    createdAt: opportunity['createdAt'],
    postingCount,
    groupCount: groups.length,
    sources,
    groups,
  };
}

router.get('/', async (_request, response) => {
  const opportunities = await Opportunity.find({ deletedAt: null }).select(publicFields).sort({ createdAt: -1 }).lean();
  const ids = opportunities.map((opportunity) => opportunity['_id']);
  const postingSummaries = await Posting.aggregate([
    { $match: { opportunityId: { $in: ids }, deletedAt: null } },
    {
      $group: {
        _id: '$opportunityId',
        postingCount: { $sum: 1 },
        sources: { $addToSet: '$sourceName' },
        groups: { $addToSet: '$groupName' },
      },
    },
  ]);
  const summaryById = new Map(postingSummaries.map((summary) => [String(summary['_id']), summary]));

  response.json({
    data: opportunities.map((opportunity) => {
      const summary = summaryById.get(String(opportunity['_id']));
      return presentOpportunity(
        opportunity as Record<string, unknown>,
        summary?.['postingCount'] ?? 0,
        summary?.['sources'] ?? [],
        summary?.['groups'] ?? [],
      );
    }),
  });
});

router.get('/:id', async (request, response) => {
  if (!Types.ObjectId.isValid(request.params['id'])) {
    response.status(400).json({ error: 'Invalid opportunity id' });
    return;
  }

  const opportunity = await Opportunity.findOne({ _id: request.params['id'], deletedAt: null })
    .select(publicFields)
    .lean();
  if (!opportunity) {
    response.status(404).json({ error: 'Opportunity not found' });
    return;
  }

  const postings = await Posting.find({ opportunityId: opportunity['_id'], deletedAt: null })
    .select('sourceName groupName createdAt')
    .sort({ createdAt: 1 })
    .lean();
  const sources = [...new Set(postings.map((posting) => posting['sourceName']))];
  const groups = [...new Set(postings.map((posting) => posting['groupName']))];

  response.json({
    data: {
      ...presentOpportunity(opportunity as Record<string, unknown>, postings.length, sources, groups),
      postings: postings.map((posting) => ({
        sourceName: posting['sourceName'],
        groupName: posting['groupName'],
        createdAt: posting['createdAt'],
      })),
    },
  });
});

router.post('/', async (request, response) => {
  const parsed = CreateOpportunitySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid opportunity', issues: parsed.error.issues });
    return;
  }

  const { requirement, posting } = parsed.data;
  const dedupeKey = createOpportunityKey(requirement);
  const opportunity = await Opportunity.findOneAndUpdate(
    { dedupeKey, deletedAt: null },
    {
      $setOnInsert: {
        dedupeKey,
        technologyStack: requirement.technologyStack,
        startDate: requirement.startDate,
        endDate: requirement.endDate,
        durationDays: requirement.durationDays,
        college: requirement.college,
        city: requirement.city,
        mode: requirement.mode,
        audience: requirement.audience,
        travel: requirement.travel,
        food: requirement.food,
        stay: requirement.stay,
        tfa: requirement.tfa,
        summary: requirement.summary,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).select(publicFields).lean();

  await Posting.create({
    opportunityId: opportunity['_id'],
    sourceName: posting.sourceName,
    groupName: posting.groupName,
    vendorName: requirement.vendorName,
    vendorCompany: requirement.vendorCompany,
    vendorPhone: posting.vendorPhone ?? requirement.vendorPhone,
    rate: posting.rate ?? requirement.rate,
    paymentDate: posting.paymentDate ?? requirement.paymentDate,
    travel: requirement.travel,
    food: requirement.food,
    stay: requirement.stay,
  });

  response.status(201).json({ data: presentOpportunity(opportunity as Record<string, unknown>, 1, [posting.sourceName], [posting.groupName]) });
});

router.put('/:id', async (request, response) => {
  if (!Types.ObjectId.isValid(request.params['id'])) {
    response.status(400).json({ error: 'Invalid opportunity id' });
    return;
  }

  const parsed = RequirementDraftSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid opportunity', issues: parsed.error.issues });
    return;
  }

  const requirement = parsed.data;
  const updated = await Opportunity.findOneAndUpdate(
    { _id: request.params['id'], deletedAt: null },
    {
      $set: {
        technologyStack: requirement.technologyStack,
        startDate: requirement.startDate,
        endDate: requirement.endDate,
        durationDays: requirement.durationDays,
        college: requirement.college,
        city: requirement.city,
        mode: requirement.mode,
        audience: requirement.audience,
        travel: requirement.travel,
        food: requirement.food,
        stay: requirement.stay,
        tfa: requirement.tfa,
        summary: requirement.summary,
      },
    },
    { new: true, runValidators: true },
  ).select(publicFields).lean();

  if (!updated) {
    response.status(404).json({ error: 'Opportunity not found' });
    return;
  }

  const postings = await Posting.find({ opportunityId: updated['_id'], deletedAt: null }).select('sourceName groupName').lean();
  response.json({
    data: presentOpportunity(
      updated as Record<string, unknown>,
      postings.length,
      [...new Set(postings.map((posting) => posting['sourceName']))],
      [...new Set(postings.map((posting) => posting['groupName']))],
    ),
  });
});

router.delete('/:id', async (request, response) => {
  if (!Types.ObjectId.isValid(request.params['id'])) {
    response.status(400).json({ error: 'Invalid opportunity id' });
    return;
  }

  const deleted = await Opportunity.findOneAndUpdate(
    { _id: request.params['id'], deletedAt: null },
    { $set: { deletedAt: new Date() } },
  );
  if (!deleted) {
    response.status(404).json({ error: 'Opportunity not found' });
    return;
  }

  await Posting.updateMany({ opportunityId: deleted['_id'], deletedAt: null }, { $set: { deletedAt: new Date() } });
  response.status(204).end();
});

export { router as requirementsRouter };