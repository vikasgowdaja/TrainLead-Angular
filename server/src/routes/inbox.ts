import { Router } from 'express';
import { ExtractedRequirementSchema, InboxCaptureSchema, InboxConvertSchema, InboxQuerySchema, InboxUpdateSchema } from '@trainlead/shared';
import { Types } from 'mongoose';
import { requireAuth } from '../auth/middleware.js';
import { actorOf, loadActor, requireOrganization } from '../auth/actor.js';
import { HttpError, notFound, objectId, parseBody } from '../http.js';
import { InboxItem } from '../models/inbox-item.js';
import { RequirementSource } from '../models/requirement-source.js';
import { createRequirementFromInput } from './requirements.js';

const router = Router();
router.use(requireAuth, loadActor);

const monthNumbers: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function mockExtract(rawText: string): { extracted: Record<string, unknown>; missingFields: string[] } {
  const extracted: Record<string, unknown> = {};
  const patterns: [RegExp, string][] = [
    [/angular\s*\.?\s*js/i, 'AngularJS'], [/\breact(?:\.js)?\b/i, 'React'],
    [/\bnode\s*\.?\s*js\b/i, 'Node.js'], [/\bjavascript\b/i, 'JavaScript'],
    [/\btypescript\b/i, 'TypeScript'], [/\bexpress(?:\.js)?\b/i, 'Express'],
    [/\brest\s*apis?\b/i, 'REST APIs'],
  ];
  const skills = [...new Set(patterns.filter(([pattern]) => pattern.test(rawText)).map(([, name]) => name))];
  if (skills.length) extracted['skills'] = skills;

  const dateMatch = rawText.match(/\b(\d{1,2})\s*(?:-|to|–)\s*(\d{1,2})\s*([a-z]{3,9})\b/i);
  if (dateMatch) {
    const month = monthNumbers[dateMatch[3]!.toLowerCase()];
    if (month !== undefined) {
      const today = new Date();
      let year = today.getUTCFullYear();
      const start = new Date(Date.UTC(year, month, Number(dateMatch[1])));
      if (start < today && month < today.getUTCMonth()) year += 1;
      const startDate = new Date(Date.UTC(year, month, Number(dateMatch[1])));
      const endDate = new Date(Date.UTC(year, month, Number(dateMatch[2])));
      extracted['startDate'] = startDate.toISOString().slice(0, 10);
      extracted['endDate'] = endDate.toISOString().slice(0, 10);
      extracted['durationDays'] = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
    }
  }
  const city = rawText.match(/(?:\b(?:in|at)\s+|,\s*)(Mysuru|Mysore|Bengaluru|Bangalore|Hyderabad|Chennai|Mumbai|Pune|Delhi)\b/i)?.[1];
  if (city) extracted['city'] = /mysore/i.test(city) ? 'Mysuru' : /bangalore/i.test(city) ? 'Bengaluru' : city;
  const audience = rawText.match(/\b((?:\d+(?:st|nd|rd|th)\s+sem(?:ester)?|final[- ]year|early[- ]career)[^,.\n]{0,90}(?:students?|engineers?|developers?)?)/i)?.[1];
  if (audience) extracted['audience'] = audience.trim();
  const duration = rawText.match(/\b(\d{1,3})\s+days?\b/i);
  if (duration && !extracted['durationDays']) extracted['durationDays'] = Number(duration[1]);
  const payment = rawText.match(/\bpayment\s+(?:on|by)?\s*(?:the\s*)?(\d{1,2})\s*([a-z]{3,9})?\b/i);
  if (payment?.[1] && payment[2]) {
    const month = monthNumbers[payment[2].toLowerCase()];
    if (month !== undefined) extracted['paymentDueDate'] = new Date(Date.UTC(new Date().getUTCFullYear(), month, Number(payment[1]))).toISOString().slice(0, 10);
  }
  if (/\b(?:tfa|travel|food|stay|accommodation)\s+(?:is\s+)?provided\b/i.test(rawText)) {
    extracted['travel'] = 'Provided'; extracted['food'] = 'Provided'; extracted['stay'] = 'Provided';
  }
  extracted['title'] = `${skills[0] ?? 'Training'} training${extracted['city'] ? ` in ${String(extracted['city'])}` : ''}`;
  extracted['mode'] = /\bonline\b/i.test(rawText) ? 'Online' : /\bhybrid\b/i.test(rawText) ? 'Hybrid' : 'Offline';
  const parsed = ExtractedRequirementSchema.safeParse(extracted);
  const result = parsed.success ? parsed.data : {};
  const missingFields = ['skills', 'city', 'startDate', 'endDate', 'durationDays', 'audience']
    .filter((field) => !result[field as keyof typeof result]);
  return { extracted: result, missingFields };
}

function inboxScope(actor: ReturnType<typeof actorOf>) {
  if (actor.role === 'Admin') return {};
  return actor.organizationId
    ? { $or: [{ organizationId: actor.organizationId }, { createdBy: actor.userId }] }
    : { createdBy: actor.userId };
}

async function getInboxItem(id: Types.ObjectId, actor: ReturnType<typeof actorOf>) {
  const item = await InboxItem.findOne({ $and: [{ _id: id }, inboxScope(actor)] } as never);
  if (!item) throw notFound('Inbox item');
  return item;
}

function presentInbox(item: InstanceType<typeof InboxItem>) {
  return {
    id: String(item._id), rawText: item.rawText, sourceType: item.sourceType,
    groupName: item.groupName, senderName: item.senderName,
    receivedAt: item.receivedAt.toISOString(), status: item.status, error: item.error,
    extracted: item.extracted, missingFields: item.missingFields,
    requirementId: item.requirementId ? String(item.requirementId) : null,
    organization: item.organizationId ? { id: String(item.organizationId), name: 'Organization' } : null,
    createdAt: item.createdAt.toISOString(),
  };
}

router.post('/', async (request, response) => {
  const actor = actorOf(request);
  if (actor.role !== 'Admin' && actor.role !== 'Vendor') throw new HttpError(403, 'Only vendors can capture requirement posts');
  const input = parseBody(InboxCaptureSchema, request.body, 'inbox capture');
  const organizationId = actor.role === 'Admin' ? actor.organizationId : requireOrganization(actor);
  const chunks = input.splitExport ? input.rawText.split(/\r?\n/).map((text) => text.trim()).filter((text) => text.length >= 5) : [input.rawText];
  const items = [];
  for (const rawText of chunks) {
    const { extracted, missingFields } = mockExtract(rawText);
    const item = await InboxItem.create({
      organizationId, createdBy: actor.userId, rawText, sourceType: input.sourceType,
      groupName: input.groupName, senderName: input.senderName,
      receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
      status: 'Extracted', extracted, missingFields,
    });
    items.push(presentInbox(item));
  }
  response.status(201).json({ data: items });
});

router.get('/', async (request, response) => {
  const actor = actorOf(request);
  const query = parseBody(InboxQuerySchema, request.query, 'query');
  const filter = { ...inboxScope(actor), ...(query.status ? { status: query.status } : {}) };
  const [total, items] = await Promise.all([
    InboxItem.countDocuments(filter as never),
    InboxItem.find(filter as never).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit),
  ]);
  response.json({ data: items.map(presentInbox), page: query.page, limit: query.limit, total, hasMore: query.page * query.limit < total });
});

router.get('/:id', async (request, response) => {
  const item = await getInboxItem(objectId(request.params['id'], 'inbox id'), actorOf(request));
  response.json({ data: presentInbox(item) });
});

router.patch('/:id', async (request, response) => {
  const item = await getInboxItem(objectId(request.params['id'], 'inbox id'), actorOf(request));
  if (item.status === 'Converted' || item.status === 'Discarded') throw new HttpError(409, 'This inbox item is no longer editable');
  const { extracted } = parseBody(InboxUpdateSchema, request.body, 'extracted fields');
  const { missingFields } = mockExtract(item.rawText);
  const updated = await InboxItem.findByIdAndUpdate(item._id, {
    $set: {
      extracted: { ...item.extracted, ...extracted },
      missingFields: missingFields.filter((field) => !extracted[field as keyof typeof extracted]),
      status: 'Extracted', error: null,
    },
  }, { new: true, runValidators: true });
  if (!updated) throw notFound('Inbox item');
  response.json({ data: presentInbox(updated) });
});

router.post('/:id/retry', async (request, response) => {
  const item = await getInboxItem(objectId(request.params['id'], 'inbox id'), actorOf(request));
  if (item.status === 'Converted' || item.status === 'Discarded') throw new HttpError(409, 'This inbox item cannot be retried');
  const { extracted, missingFields } = mockExtract(item.rawText);
  item.extracted = extracted; item.missingFields = missingFields; item.status = 'Extracted'; item.error = null; item.attempts += 1;
  await item.save();
  response.json({ data: presentInbox(item) });
});

router.post('/:id/convert', async (request, response) => {
  const actor = actorOf(request);
  if (actor.role !== 'Admin' && actor.role !== 'Vendor') throw new HttpError(403, 'Only vendors can publish a requirement');
  const item = await getInboxItem(objectId(request.params['id'], 'inbox id'), actor);
  if (item.status === 'Converted' || item.status === 'Discarded') throw new HttpError(409, 'This inbox item has already been processed');
  const payload = parseBody(InboxConvertSchema, request.body, 'requirement conversion');
  const source = {
    sourceType: item.sourceType, groupName: item.groupName, rawText: item.rawText,
    postedAt: item.receivedAt.toISOString(),
  };
  const organizationId = payload.organizationId ?? (actor.role === 'Admin' ? item.organizationId?.toString() : undefined);
  const requirement = await createRequirementFromInput(actor, payload.requirement, payload.publish, source, organizationId);
  await RequirementSource.updateOne(
    { requirementId: requirement._id, sourceType: item.sourceType, groupName: item.groupName } as never,
    { $set: { inboxItemId: item._id } },
  );
  item.status = 'Converted'; item.requirementId = requirement._id;
  await item.save();
  response.status(201).json({ data: { id: String(requirement._id), inboxItem: presentInbox(item) } });
});

router.delete('/:id', async (request, response) => {
  const item = await getInboxItem(objectId(request.params['id'], 'inbox id'), actorOf(request));
  if (item.status === 'Converted') throw new HttpError(409, 'A converted inbox item cannot be discarded');
  item.status = 'Discarded';
  await item.save();
  response.status(204).end();
});

export { router as inboxRouter };
