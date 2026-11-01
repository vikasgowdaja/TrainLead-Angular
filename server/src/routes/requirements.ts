import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer, { type FileFilterCallback } from 'multer';
import {
  CreateRequirementSchema,
  DemoSlotsUpdateSchema,
  GroupRequirementsSchema,
  RequirementInputSchema,
  RequirementQuerySchema,
  SmartExtractionRequestSchema,
  SourceInputSchema,
  SourceUpdateSchema,
  StatusChangeSchema,
  canTransition,
  type DashboardStats,
  type GroupMemberView,
  type OrganizationPublicView,
  type RequirementDetail,
  type RequirementSummary,
  type RequirementStatus,
  type SourceView,
  type VendorRef,
} from '@trainlead/shared';
import { Types } from 'mongoose';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { actorOf, loadActor, requireOrganization } from '../auth/actor.js';
import { HttpError, escapeRegex, notFound, objectId, parseBody, toIsoDate } from '../http.js';
import { Organization, organizationName } from '../models/organization.js';
import { Application } from '../models/application.js';
import { Requirement, type RequirementDoc } from '../models/requirement.js';
import { RequirementSource } from '../models/requirement-source.js';
import { InboxItem } from '../models/inbox-item.js';
import { canManageRequirement, canViewRequirementCommercials, visibilityFilter } from '../services/access.js';
import { autoGroup, computeMatchKey, findSimilar, groupManually, refreshGroup, ungroup } from '../services/grouping.js';
import { canonicalSkillKey, resolveSkills } from '../services/skills.js';
import { notifyMatchingTrainersOfRequirement } from '../services/trainer-notifications.js';
import { extractRequirement, extractRequirementImage } from '../services/requirement-extraction.js';
import { withTransaction } from '../database.js';

const router = Router();
router.use(requireAuth);
const extractionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false });
const acceptedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_request, file, callback: FileFilterCallback) {
    if (!acceptedImageTypes.has(file.mimetype)) {
      callback(new HttpError(415, 'Upload a PNG, JPG, or WebP image. PDF files are not supported.'));
      return;
    }
    callback(null, true);
  },
});

const parseImageUpload: RequestHandler = (request, response, next) => {
  imageUpload.single('file')(request, response, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new HttpError(413, 'Image must be 5 MB or smaller.'));
      return;
    }
    next(error);
  });
};

function hasExpectedImageSignature(file: Express.Multer.File): boolean {
  const buffer = file.buffer;
  if (file.mimetype === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (file.mimetype === 'image/webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

interface RequirementRecord {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  title: string;
  description: string;
  domain: string;
  skillIds: Types.ObjectId[];
  skillNames: string[];
  skillKeys: string[];
  city: string;
  state: string;
  mode: string;
  startDate: Date;
  endDate: Date;
  durationDays: number;
  audience: string;
  studentCount: number | null;
  experienceRequired: string;
  budgetMin: number | null;
  budgetMax: number | null;
  paymentTerms: string | null;
  paymentDueDate: Date | null;
  travel: RequirementSummary['travel'];
  food: RequirementSummary['food'];
  stay: RequirementSummary['stay'];
  demoSlots: { provider: RequirementDetail['demoSlots'][number]['provider']; meetingUrl: string; scheduledAt: Date }[];
  status: RequirementStatus;
  publishedAt: Date | null;
  groupId: Types.ObjectId | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface OrganizationRecord {
  _id: Types.ObjectId;
  legalName: string;
  brandName: string;
  type: OrganizationPublicView['type'];
  city: string;
  state: string;
  website: string | null;
  verificationStatus: OrganizationPublicView['verificationStatus'];
  primaryContactName: string;
  email: string | null;
  phone: string | null;
}

const visibility = (actor: ReturnType<typeof actorOf>) => visibilityFilter(actor);
const toVendorRef = (org: OrganizationRecord): VendorRef => ({ id: String(org._id), name: organizationName(org) });

function toOrganizationPublic(org: OrganizationRecord): OrganizationPublicView {
  return {
    id: String(org._id),
    name: organizationName(org),
    legalName: org.legalName,
    type: org.type,
    city: org.city,
    state: org.state,
    website: org.website,
    verificationStatus: org.verificationStatus,
  };
}

async function getVisibleRequirement(id: Types.ObjectId, actor: ReturnType<typeof actorOf>): Promise<RequirementRecord> {
  const requirement = await Requirement.findOne({ $and: [{ _id: id }, visibility(actor)] } as never).lean();
  if (!requirement) {
    throw notFound('Requirement');
  }
  return requirement as unknown as RequirementRecord;
}

async function getOrganizationMap(ids: Types.ObjectId[]): Promise<Map<string, OrganizationRecord>> {
  const uniqueIds = [...new Set(ids.map(String))].map((id) => new Types.ObjectId(id));
  const organizations = await Organization.find({ _id: { $in: uniqueIds }, deletedAt: null } as never)
    .select('legalName brandName type city state website verificationStatus primaryContactName email phone')
    .lean();
  return new Map(organizations.map((org) => [String(org._id), org as unknown as OrganizationRecord]));
}

function managementStatus(status: RequirementStatus): RequirementStatus[] {
  const map: Record<RequirementStatus, RequirementStatus[]> = {
    Draft: ['Open', 'Cancelled'],
    Open: ['Paused', 'Filled', 'Closed', 'Cancelled'],
    Paused: ['Open', 'Closed', 'Cancelled'],
    Filled: ['Open', 'Closed'],
    Closed: ['Open'],
    Cancelled: [],
  };
  return map[status];
}

async function summarize(
  requirement: RequirementRecord,
  actor: ReturnType<typeof actorOf>,
  organizationMap: Map<string, OrganizationRecord>,
  groupSizeMap: Map<string, number>,
  groupVendorsMap: Map<string, VendorRef[]>,
  sourceCountMap: Map<string, number>,
  pendingApplicationsMap: Map<string, number>,
): Promise<RequirementSummary> {
  const organization = organizationMap.get(String(requirement.organizationId));
  const groupKey = requirement.groupId ? String(requirement.groupId) : String(requirement._id);
  return {
    id: String(requirement._id),
    title: requirement.title,
    skills: requirement.skillNames,
    city: requirement.city,
    state: requirement.state,
    mode: requirement.mode as RequirementSummary['mode'],
    startDate: toIsoDate(requirement.startDate)!,
    endDate: toIsoDate(requirement.endDate)!,
    durationDays: requirement.durationDays,
    audience: requirement.audience,
    studentCount: requirement.studentCount,
    travel: requirement.travel,
    food: requirement.food,
    stay: requirement.stay,
    paymentDueDate: canViewRequirementCommercials(actor, requirement) ? toIsoDate(requirement.paymentDueDate) : null,
    status: requirement.status,
    organization: organization ? toVendorRef(organization) : { id: String(requirement.organizationId), name: 'Organization' },
    groupId: requirement.groupId ? String(requirement.groupId) : null,
    groupSize: requirement.groupId ? groupSizeMap.get(groupKey) ?? 1 : 1,
    sourceCount: sourceCountMap.get(String(requirement._id)) ?? 0,
    pendingApplications: canManageRequirement(actor, requirement) ? pendingApplicationsMap.get(String(requirement._id)) ?? 0 : 0,
    vendors: groupVendorsMap.get(groupKey) ?? (organization ? [toVendorRef(organization)] : []),
    canManage: canManageRequirement(actor, requirement),
    createdAt: requirement.createdAt.toISOString(),
    updatedAt: requirement.updatedAt.toISOString(),
  };
}

async function presentationMaps(requirements: RequirementRecord[], actor: ReturnType<typeof actorOf>) {
  const requirementIds = requirements.map((item) => item._id);
  const groupIds = [...new Set(requirements.flatMap((item) => (item.groupId ? [item.groupId] : [])))];
  const siblings = groupIds.length
    ? ((await Requirement.find({ groupId: { $in: groupIds }, ...visibility(actor) } as never)
        .select('_id organizationId groupId')
        .lean()) as unknown as Pick<RequirementRecord, '_id' | 'organizationId' | 'groupId'>[])
    : [];
  const allOrganizations = [...requirements, ...siblings].map((item) => item.organizationId);
  const organizationMap = await getOrganizationMap(allOrganizations);
  const groupSizeMap = new Map<string, number>();
  const groupVendorsMap = new Map<string, VendorRef[]>();
  for (const member of siblings) {
    const groupKey = String(member.groupId);
    groupSizeMap.set(groupKey, (groupSizeMap.get(groupKey) ?? 0) + 1);
    const organization = organizationMap.get(String(member.organizationId));
    if (organization) {
      const vendors = groupVendorsMap.get(groupKey) ?? [];
      if (!vendors.some((vendor) => vendor.id === String(organization._id))) {
        vendors.push(toVendorRef(organization));
      }
      groupVendorsMap.set(groupKey, vendors);
    }
  }
  const sourceCounts = requirementIds.length
    ? await RequirementSource.aggregate([
        { $match: { requirementId: { $in: [...requirementIds, ...siblings.map((item) => item._id)] }, deletedAt: null } },
        { $group: { _id: '$requirementId', count: { $sum: 1 } } },
      ])
    : [];
  const countByRequirement = new Map(sourceCounts.map((item) => [String(item['_id']), Number(item['count'])]));
  const pendingApplications = actor.role === 'Vendor' || actor.role === 'Admin'
    ? await Application.aggregate([
        { $match: { requirementId: { $in: requirementIds }, status: 'Applied', deletedAt: null } },
        { $group: { _id: '$requirementId', count: { $sum: 1 } } },
      ])
    : [];
  const pendingApplicationsMap = new Map(pendingApplications.map((item) => [String(item['_id']), Number(item['count'])]));
  const allMembers = [...new Map([...requirements, ...siblings].map((item) => [String(item._id), item])).values()];
  const sourceCountMap = new Map<string, number>();
  for (const requirement of allMembers) {
    const groupKey = requirement.groupId ? String(requirement.groupId) : String(requirement._id);
    const countKey = String(requirement._id);
    sourceCountMap.set(countKey, requirement.groupId
      ? allMembers
          .filter((member) => member.groupId?.equals(requirement.groupId))
          .reduce((total, member) => total + (countByRequirement.get(String(member._id)) ?? 0), 0)
      : countByRequirement.get(countKey) ?? 0);
    if (!requirement.groupId) sourceCountMap.set(groupKey, countByRequirement.get(countKey) ?? 0);
  }
  return { organizationMap, groupSizeMap, groupVendorsMap, sourceCountMap, pendingApplicationsMap };
}

async function createRequirement(
  actor: ReturnType<typeof actorOf>,
  requirementInput: ReturnType<typeof RequirementInputSchema.parse>,
  publish: boolean,
  sourceInput?: ReturnType<typeof SourceInputSchema.parse>,
  requestedOrganizationId?: string,
): Promise<RequirementRecord> {
  if (actor.role !== 'Vendor' && actor.role !== 'Admin') {
    throw new HttpError(403, 'Only vendors can post requirements');
  }
  const organizationId = actor.role === 'Admin' && requestedOrganizationId
    ? objectId(requestedOrganizationId, 'organization id')
    : requireOrganization(actor);
  const organization = await Organization.findOne({ _id: organizationId, deletedAt: null } as never).lean();
  if (!organization) {
    throw notFound('Organization');
  }
  if (actor.role !== 'Admin' && actor.orgRole !== 'owner' && actor.orgRole !== 'recruiter') {
    throw new HttpError(403, 'Only organization members can post requirements');
  }

  const created = await withTransaction(async (session) => {
    const skills = await resolveSkills(requirementInput.skills, actor.userId, session);
    const document = new Requirement({
      ...requirementInput,
      organizationId,
      createdBy: actor.userId,
      skillIds: skills.ids,
      skillNames: skills.names,
      skillKeys: skills.keys,
      status: publish ? 'Open' : 'Draft',
      publishedAt: publish ? new Date() : null,
      matchKey: computeMatchKey(requirementInput.city, requirementInput.startDate, requirementInput.endDate),
    });
    await document.save({ session });
    if (sourceInput) {
      const source = new RequirementSource({
        requirementId: document._id,
        organizationId,
        ...sourceInput,
        postedAt: sourceInput.postedAt ? new Date(sourceInput.postedAt) : null,
        createdBy: actor.userId,
      });
      await source.save({ session });
    }
    if (publish) {
      await autoGroup(document._id, session);
      await notifyMatchingTrainersOfRequirement(document._id, document.title, skills.names, session);
    }
    return document;
  });
  return created.toObject() as unknown as RequirementRecord;
}

async function requirementDetail(requirement: RequirementRecord, actor: ReturnType<typeof actorOf>): Promise<RequirementDetail> {
  const canManage = canManageRequirement(actor, requirement);
  const canSeeCommercials = canViewRequirementCommercials(actor, requirement);
  const [maps, groupDocuments] = await Promise.all([
    presentationMaps([requirement], actor),
    requirement.groupId
      ? Requirement.find({ groupId: requirement.groupId, ...visibility(actor) } as never)
          .select('_id title status organizationId groupId')
          .lean()
      : Promise.resolve([]),
  ]);
  const groupRecords = groupDocuments as unknown as RequirementRecord[];
  const sourceRequirementIds = requirement.groupId ? groupRecords.map((member) => member._id) : [requirement._id];
  const sourceDocuments = await RequirementSource.find({ requirementId: { $in: sourceRequirementIds }, deletedAt: null } as never)
    .sort({ createdAt: 1 })
    .lean();
  const bookedSlots = await Application.find({ requirementId: requirement._id, demoSlotAt: { $ne: null }, status: { $in: ['InterviewScheduled', 'Accepted'] }, deletedAt: null } as never)
    .select('demoSlotAt trainerId')
    .lean();
  const bookedTimes = new Set(bookedSlots.map((application) => new Date(application['demoSlotAt'] as Date).getTime()));
  const ownBookedTimes = new Set(bookedSlots.filter((application) => String(application['trainerId']) === String(actor.userId))
    .map((application) => new Date(application['demoSlotAt'] as Date).getTime()));
  const organizationIds = [requirement.organizationId, ...groupRecords.map((member) => member.organizationId)];
  const organizationMap = await getOrganizationMap(organizationIds);
  const sources: SourceView[] = sourceDocuments.map((source) => {
    const org = organizationMap.get(String(source['organizationId']));
    return {
      id: String(source['_id']),
      requirementId: String(source['requirementId']),
      sourceType: source['sourceType'] as SourceView['sourceType'],
      groupName: String(source['groupName'] ?? ''),
      postedAt: toIsoDate(source['postedAt'] as Date | null),
      importedAt: (source['importedAt'] as Date).toISOString(),
      organization: org ? toVendorRef(org) : { id: String(source['organizationId']), name: 'Organization' },
      rawText: actor.role === 'Admin' || actor.organizationId?.toString() === String(source['organizationId'])
        ? String(source['rawText'] ?? '')
        : null,
      canManage: actor.role === 'Admin' || actor.organizationId?.toString() === String(source['organizationId']),
    };
  });
  const groupMembers: GroupMemberView[] = [];
  for (const member of groupRecords) {
    const org = organizationMap.get(String(member.organizationId));
    groupMembers.push({
      id: String(member._id),
      title: member.title,
      status: member.status,
      organization: org ? toVendorRef(org) : { id: String(member.organizationId), name: 'Organization' },
    });
  }
  const organization = organizationMap.get(String(requirement.organizationId));
  const summary = await summarize(
    requirement,
    actor,
    maps.organizationMap,
    maps.groupSizeMap,
    maps.groupVendorsMap,
    maps.sourceCountMap,
    maps.pendingApplicationsMap,
  );
  return {
    ...summary,
    description: requirement.description,
    domain: requirement.domain,
    experienceRequired: requirement.experienceRequired,
    budgetMin: canSeeCommercials ? requirement.budgetMin : null,
    budgetMax: canSeeCommercials ? requirement.budgetMax : null,
    paymentTerms: canSeeCommercials ? requirement.paymentTerms : null,
    organizationDetail: organization
      ? {
          ...toOrganizationPublic(organization),
          contact: canManage
            ? { name: organization.primaryContactName, email: organization.email, phone: organization.phone }
            : null,
        }
      : {
          id: String(requirement.organizationId),
          name: 'Organization',
          legalName: 'Organization',
          type: 'Individual',
          city: requirement.city,
          state: requirement.state,
          website: null,
          verificationStatus: 'Pending',
          contact: null,
        },
    sources,
    groupMembers,
    demoSlots: (requirement.demoSlots ?? []).map((slot) => ({
      provider: slot.provider,
      meetingUrl: canManage || ownBookedTimes.has(slot.scheduledAt.getTime()) ? slot.meetingUrl : null,
      scheduledAt: slot.scheduledAt.toISOString(),
      available: !bookedTimes.has(slot.scheduledAt.getTime()) && slot.scheduledAt > new Date(),
      booked: bookedTimes.has(slot.scheduledAt.getTime()),
    })),
    allowedStatuses: canManage ? managementStatus(requirement.status) : [],
  };
}

router.post('/extract', extractionLimiter, requireRole('Admin', 'Vendor'), async (request, response) => {
  const input = parseBody(SmartExtractionRequestSchema, request.body, 'extraction input');
  response.json({ data: extractRequirement(input.input, input.inputType) });
});

router.post('/extract-image', extractionLimiter, requireRole('Admin', 'Vendor'), parseImageUpload, async (request, response) => {
  const file = request.file;
  if (!file) throw new HttpError(400, 'Choose an image before extracting.');
  if (!hasExpectedImageSignature(file)) throw new HttpError(415, 'The uploaded file content does not match a PNG, JPG, or WebP image.');
  response.json({ data: await extractRequirementImage(file.buffer) });
});

router.get('/stats', loadActor, async (request, response) => {
  const actor = actorOf(request);
  const requirements = (await Requirement.find(visibility(actor) as never)
    .select('_id groupId status paymentDueDate organizationId createdAt updatedAt')
    .lean()) as unknown as Pick<RequirementRecord, '_id' | 'groupId' | 'status' | 'paymentDueDate' | 'organizationId' | 'createdAt' | 'updatedAt'>[];
  const requirementIds = requirements.map((item) => item._id);
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const opportunityKey = (item: (typeof requirements)[number]) => String(item.groupId ?? item._id);
  const active = new Set(requirements.filter((item) => item.status === 'Open' || item.status === 'Paused').map(opportunityKey));
  const open = new Set(requirements.filter((item) => item.status === 'Open').map(opportunityKey));
  const newThisWeek = new Set(requirements.filter((item) => item.createdAt >= monday).map(opportunityKey));
  const repeatedGroups = new Set(requirements.flatMap((item) => (item.groupId ? [String(item.groupId)] : [])));
  const withPaymentDate = new Set(requirements.filter((item) => item.paymentDueDate).map(opportunityKey));
  const sourcePosts = requirementIds.length
    ? await RequirementSource.countDocuments({ requirementId: { $in: requirementIds }, deletedAt: null } as never)
    : 0;
  const organizationIds = [...new Set(requirements.map((item) => String(item.organizationId)))];
  const vendorCount = actor.role === 'Admin'
    ? await Organization.countDocuments({ deletedAt: null } as never)
    : organizationIds.length;
  const organizations = organizationIds.length
    ? await Organization.find({ _id: { $in: organizationIds } } as never).select('legalName brandName').lean()
    : [];
  const orgById = new Map(organizations.map((org) => [String(org['_id']), organizationName(org as unknown as OrganizationRecord)]));
  const sourceCounts = requirementIds.length
    ? await RequirementSource.aggregate([
        { $match: { requirementId: { $in: requirementIds }, deletedAt: null } },
        { $group: { _id: '$organizationId', sourceCount: { $sum: 1 } } },
        { $sort: { sourceCount: -1 } },
        { $limit: 5 },
      ])
    : [];
  const inboxScope = actor.role === 'Admin'
    ? { status: { $in: ['Pending', 'Extracted', 'Failed'] } }
    : { createdBy: actor.userId, status: { $in: ['Pending', 'Extracted', 'Failed'] } };
  const inboxPending = await InboxItem.countDocuments(inboxScope as never);
  const stats: DashboardStats = {
    activeOpportunities: active.size,
    openOpportunities: open.size,
    newThisWeek: newThisWeek.size,
    repeatedGroups: repeatedGroups.size,
    withPaymentDate: withPaymentDate.size,
    vendors: vendorCount,
    sourcePosts,
    inboxPending,
    lastUpdatedAt: requirements.reduce<string | null>((latest, item) => {
      const value = item.updatedAt.toISOString();
      return !latest || value > latest ? value : latest;
    }, null),
    topVendors: sourceCounts.map((item) => ({
      id: String(item['_id']),
      name: orgById.get(String(item['_id'])) ?? 'Organization',
      sourceCount: Number(item['sourceCount']),
    })),
  };
  response.json({ data: stats });
});

router.get('/', loadActor, async (request, response) => {
  const actor = actorOf(request);
  const query = parseBody(RequirementQuerySchema, request.query, 'query');
  const clauses: Record<string, unknown>[] = [visibility(actor) as Record<string, unknown>];
  if (query.mine) {
    clauses.push(actor.role === 'Admin'
      ? { createdBy: actor.userId }
      : actor.organizationId
        ? { organizationId: actor.organizationId }
        : { _id: { $exists: false } });
  }
  if (query.status) clauses.push({ status: query.status });
  if (query.city) clauses.push({ city: { $regex: `^${escapeRegex(query.city)}$`, $options: 'i' } });
  if (query.vendor) clauses.push({ organizationId: objectId(query.vendor, 'vendor id') });
  if (query.startFrom || query.startTo) {
    clauses.push({ startDate: { ...(query.startFrom ? { $gte: new Date(query.startFrom) } : {}), ...(query.startTo ? { $lte: new Date(query.startTo) } : {}) } });
  }
  if (query.endFrom || query.endTo) {
    clauses.push({ endDate: { ...(query.endFrom ? { $gte: new Date(query.endFrom) } : {}), ...(query.endTo ? { $lte: new Date(query.endTo) } : {}) } });
  }
  if (query.mode) clauses.push({ mode: query.mode });
  if (query.repeated !== undefined) clauses.push(query.repeated ? { groupId: { $ne: null } } : { groupId: null });
  if (query.hasPaymentDate !== undefined) clauses.push(query.hasPaymentDate ? { paymentDueDate: { $ne: null } } : { paymentDueDate: null });
  if (query.skill) clauses.push({ skillKeys: await canonicalSkillKey(query.skill) });
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    const matchingOrganizations = await Organization.find({
      deletedAt: null,
      $or: [{ legalName: pattern }, { brandName: pattern }],
    } as never).distinct('_id');
    clauses.push({
      $or: [
        { title: pattern },
        { description: pattern },
        { skillNames: pattern },
        { city: pattern },
        { organizationId: { $in: matchingOrganizations } },
      ],
    });
  }
  const sortBy: Record<typeof query.sort, Record<string, 1 | -1>> = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    upcoming: { startDate: 1 },
    updated: { updatedAt: -1 },
    start: { startDate: 1 },
  };
  const filter = { $and: clauses };
  const recordSort = Object.fromEntries(Object.entries(sortBy[query.sort]).map(([field, direction]) => [`record.${field}`, direction]));
  const [result] = await Requirement.aggregate([
    { $match: filter },
    { $sort: sortBy[query.sort] },
    { $group: { _id: { $ifNull: ['$groupId', '$_id'] }, record: { $first: '$$ROOT' } } },
    { $sort: recordSort },
    {
      $facet: {
        data: [
          { $skip: (query.page - 1) * query.limit },
          { $limit: query.limit },
          { $replaceRoot: { newRoot: '$record' } },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);
  const records = (result?.['data'] ?? []) as RequirementRecord[];
  const total = Number(result?.['total']?.[0]?.['count'] ?? 0);
  const maps = await presentationMaps(records, actor);
  const data = await Promise.all(records.map((record) => summarize(record, actor, maps.organizationMap, maps.groupSizeMap, maps.groupVendorsMap, maps.sourceCountMap, maps.pendingApplicationsMap)));
  response.json({ data, page: query.page, limit: query.limit, total, hasMore: query.page * query.limit < total });
});

router.post('/', requireRole('Admin', 'Vendor'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const payload = parseBody(CreateRequirementSchema, request.body, 'requirement');
  const record = await createRequirement(actor, payload.requirement, payload.publish, payload.source, payload.organizationId);
  response.status(201).json({ data: await requirementDetail(record, actor) });
});

router.post('/groups', loadActor, async (request, response) => {
  const actor = actorOf(request);
  const payload = parseBody(GroupRequirementsSchema, request.body, 'group');
  const ids = payload.requirementIds.map((id) => objectId(id, 'requirement id'));
  for (const id of ids) {
    const requirement = await getVisibleRequirement(id, actor);
    if (!canManageRequirement(actor, requirement)) throw new HttpError(403, 'You can only group requirements you manage');
  }
  const groupId = await withTransaction((session) => groupManually(ids, actor.userId, session));
  response.status(201).json({ data: { id: String(groupId) } });
});

router.get('/:id/similar', loadActor, async (request, response) => {
  const actor = actorOf(request);
  const requirement = await getVisibleRequirement(objectId(request.params['id'], 'requirement id'), actor);
  const similar = await findSimilar(requirement as unknown as RequirementDoc, visibility(actor));
  response.json({ data: similar.map((item) => ({ id: String(item['_id']), title: item.title, city: item.city, startDate: toIsoDate(item.startDate), skills: item.skillNames })) });
});

router.get('/:id', loadActor, async (request, response) => {
  const actor = actorOf(request);
  const requirement = await getVisibleRequirement(objectId(request.params['id'], 'requirement id'), actor);
  response.json({ data: await requirementDetail(requirement, actor) });
});

router.put('/:id', requireRole('Admin', 'Vendor'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const id = objectId(request.params['id'], 'requirement id');
  const current = await getVisibleRequirement(id, actor);
  if (!canManageRequirement(actor, current)) throw new HttpError(403, 'Only the posting organization can edit this requirement');
  const input = parseBody(RequirementInputSchema, request.body, 'requirement');
  const updated = await withTransaction(async (session) => {
    const skills = await resolveSkills(input.skills, actor.userId, session);
    if (current.groupId) await ungroup(id, session);
    const updateQuery = Requirement.findOneAndUpdate(
      { _id: id, organizationId: current.organizationId, deletedAt: null } as never,
      {
        $set: {
          ...input,
          skillIds: skills.ids,
          skillNames: skills.names,
          skillKeys: skills.keys,
          matchKey: computeMatchKey(input.city, input.startDate, input.endDate),
          autoGroupOptOut: false,
        },
      },
      { new: true, runValidators: true },
    );
    const saved = await (session ? updateQuery.session(session) : updateQuery);
    if (!saved) throw notFound('Requirement');
    if (saved.status !== 'Draft') await autoGroup(saved._id, session);
    return saved.toObject() as unknown as RequirementRecord;
  });
  response.json({ data: await requirementDetail(updated, actor) });
});

router.put('/:id/demo-slots', requireRole('Admin', 'Vendor'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const id = objectId(request.params['id'], 'requirement id');
  const current = await getVisibleRequirement(id, actor);
  if (!canManageRequirement(actor, current)) throw new HttpError(403, 'Only the posting organization can manage demo slots');
  const { slots } = parseBody(DemoSlotsUpdateSchema, request.body, 'demo slots');
  const now = new Date();
  if (slots.some((slot) => new Date(slot.scheduledAt) <= now && !current.demoSlots.some((existing) =>
    existing.scheduledAt.getTime() === new Date(slot.scheduledAt).getTime() && existing.provider === slot.provider && existing.meetingUrl === slot.meetingUrl))) {
    throw new HttpError(400, 'New demo slots must be in the future');
  }
  const booked = await Application.find({ requirementId: id, demoSlotAt: { $ne: null }, status: { $in: ['InterviewScheduled', 'Accepted'] }, deletedAt: null } as never)
    .select('demoSlotAt interviewProvider meetingUrl')
    .lean();
  for (const application of booked) {
    const bookedAt = new Date(application['demoSlotAt'] as Date).getTime();
    const retained = slots.find((slot) => new Date(slot.scheduledAt).getTime() === bookedAt);
    if (!retained || retained.provider !== application['interviewProvider'] || retained.meetingUrl !== application['meetingUrl']) {
      throw new HttpError(409, 'Booked demo slots cannot be removed or changed');
    }
  }
  const updated = await Requirement.findOneAndUpdate(
    { _id: id, organizationId: current.organizationId, deletedAt: null } as never,
    { $set: { demoSlots: slots.map((slot) => ({ ...slot, scheduledAt: new Date(slot.scheduledAt) })) } },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) throw notFound('Requirement');
  response.json({ data: await requirementDetail(updated as unknown as RequirementRecord, actor) });
});

router.patch('/:id/status', requireRole('Admin', 'Vendor'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const id = objectId(request.params['id'], 'requirement id');
  const current = await getVisibleRequirement(id, actor);
  if (!canManageRequirement(actor, current)) throw new HttpError(403, 'Only the posting organization can change this status');
  const { status } = parseBody(StatusChangeSchema, request.body, 'status');
  if (!canTransition(current.status, status)) throw new HttpError(409, `Cannot change status from ${current.status} to ${status}`);
  const updated = await Requirement.findOneAndUpdate(
    { _id: id, organizationId: current.organizationId, deletedAt: null } as never,
    { $set: { status, publishedAt: status === 'Open' ? current.publishedAt ?? new Date() : current.publishedAt } },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) throw notFound('Requirement');
  if (status !== 'Draft') await autoGroup(id);
  if (status === 'Open' && current.status !== 'Open') {
    await notifyMatchingTrainersOfRequirement(id, updated.title, updated.skillNames);
  }
  response.json({ data: await requirementDetail(updated as unknown as RequirementRecord, actor) });
});

router.post('/:id/duplicate', requireRole('Admin', 'Vendor'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const current = await getVisibleRequirement(objectId(request.params['id'], 'requirement id'), actor);
  if (!canManageRequirement(actor, current)) throw new HttpError(403, 'Only the posting organization can duplicate this requirement');
  const { _id: _id, ...copy } = current;
  const requirement = {
    title: `${copy.title} (copy)`,
    description: copy.description,
    domain: copy.domain,
    skills: copy.skillNames,
    city: copy.city,
    state: copy.state,
    mode: copy.mode as 'Offline' | 'Online' | 'Hybrid',
    startDate: toIsoDate(copy.startDate)!,
    endDate: toIsoDate(copy.endDate)!,
    durationDays: copy.durationDays,
    audience: copy.audience,
    studentCount: copy.studentCount,
    experienceRequired: copy.experienceRequired,
    budgetMin: copy.budgetMin,
    budgetMax: copy.budgetMax,
    paymentTerms: copy.paymentTerms,
    paymentDueDate: toIsoDate(copy.paymentDueDate),
    travel: copy.travel,
    food: copy.food,
    stay: copy.stay,
  };
  const parsed = parseBody(RequirementInputSchema, requirement, 'requirement');
  const duplicate = await createRequirement(actor, parsed, false);
  response.status(201).json({ data: await requirementDetail(duplicate, actor) });
});

router.post('/:id/sources', requireRole('Admin', 'Vendor'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const id = objectId(request.params['id'], 'requirement id');
  const requirement = await getVisibleRequirement(id, actor);
  if (!canManageRequirement(actor, requirement)) throw new HttpError(403, 'Only the posting organization can add sources');
  const input = parseBody(SourceInputSchema, request.body, 'source');
  const source = await RequirementSource.create({
    requirementId: id,
    organizationId: requirement.organizationId,
    createdBy: actor.userId,
    ...input,
    postedAt: input.postedAt ? new Date(input.postedAt) : null,
  });
  response.status(201).json({ data: { id: String(source._id) } });
});

router.patch('/:id/sources/:sourceId', requireRole('Admin', 'Vendor'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const requirementId = objectId(request.params['id'], 'requirement id');
  const requirement = await getVisibleRequirement(requirementId, actor);
  if (!canManageRequirement(actor, requirement)) throw new HttpError(403, 'Only the posting organization can edit sources');
  const sourceId = objectId(request.params['sourceId'], 'source id');
  const input = parseBody(SourceUpdateSchema, request.body, 'source');
  const updated = await RequirementSource.findOneAndUpdate(
    { _id: sourceId, requirementId, deletedAt: null } as never,
    { $set: { ...input, ...(input.postedAt !== undefined ? { postedAt: input.postedAt ? new Date(input.postedAt) : null } : {}) } },
    { new: true, runValidators: true },
  );
  if (!updated) throw notFound('Source');
  response.json({ data: { id: String(updated._id) } });
});

router.delete('/:id/sources/:sourceId', requireRole('Admin', 'Vendor'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const requirementId = objectId(request.params['id'], 'requirement id');
  const requirement = await getVisibleRequirement(requirementId, actor);
  if (!canManageRequirement(actor, requirement)) throw new HttpError(403, 'Only the posting organization can remove sources');
  const sourceId = objectId(request.params['sourceId'], 'source id');
  const removed = await RequirementSource.findOneAndUpdate(
    { _id: sourceId, requirementId, deletedAt: null } as never,
    { $set: { deletedAt: new Date() } },
  );
  if (!removed) throw notFound('Source');
  response.status(204).end();
});

router.delete('/:id/group', requireRole('Admin', 'Vendor'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const id = objectId(request.params['id'], 'requirement id');
  const requirement = await getVisibleRequirement(id, actor);
  if (!canManageRequirement(actor, requirement)) throw new HttpError(403, 'Only the posting organization can ungroup this requirement');
  await withTransaction((session) => ungroup(id, session));
  response.status(204).end();
});

router.delete('/:id', requireRole('Admin', 'Vendor'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const id = objectId(request.params['id'], 'requirement id');
  const current = await getVisibleRequirement(id, actor);
  if (!canManageRequirement(actor, current)) throw new HttpError(403, 'Only the posting organization can delete this requirement');
  await withTransaction(async (session) => {
    const updateQuery = Requirement.findOneAndUpdate(
      { _id: id, organizationId: current.organizationId, deletedAt: null } as never,
      { $set: { deletedAt: new Date() } },
    );
    await (session ? updateQuery.session(session) : updateQuery);
    await refreshGroup(current.groupId, session);
  });
  response.status(204).end();
});

export { router as requirementsRouter, createRequirement as createRequirementFromInput };
