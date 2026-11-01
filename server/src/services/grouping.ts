import type { ClientSession, Types } from 'mongoose';
import { Requirement, type RequirementDoc } from '../models/requirement.js';
import { RequirementGroup } from '../models/requirement-group.js';
import { HttpError } from '../http.js';

const groupable = { deletedAt: null, status: { $ne: 'Draft' } };

function normalizeCity(city: string): string {
  return city.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function computeMatchKey(city: string, startDate: string | Date, endDate: string | Date): string {
  const day = (value: string | Date) => (typeof value === 'string' ? value : value.toISOString().slice(0, 10));
  return `${normalizeCity(city)}|${day(startDate)}|${day(endDate)}`;
}

/** Dissolves a group that has fewer than two active members left, so counts never show "Seen 1 time". */
export async function refreshGroup(groupId: Types.ObjectId | null | undefined, session?: ClientSession): Promise<void> {
  if (!groupId) {
    return;
  }
  const activeQuery = Requirement.countDocuments({ groupId, ...groupable } as never);
  const active = await (session ? activeQuery.session(session) : activeQuery);
  if (active < 2) {
    const clearQuery = Requirement.updateMany({ groupId } as never, { $set: { groupId: null } });
    const deleteQuery = RequirementGroup.deleteOne({ _id: groupId } as never);
    await (session ? clearQuery.session(session) : clearQuery);
    await (session ? deleteQuery.session(session) : deleteQuery);
  }
}

/**
 * Links a published requirement to others with the same city, the same dates and at least one
 * shared skill. Sharing a technology alone is never enough.
 */
export async function autoGroup(requirementId: Types.ObjectId, session?: ClientSession): Promise<void> {
  const requirementQuery = Requirement.findById(requirementId);
  const requirement = await (session ? requirementQuery.session(session) : requirementQuery);
  if (!requirement || requirement.deletedAt || requirement.status === 'Draft' || requirement.autoGroupOptOut || requirement.groupId) {
    return;
  }

  const matchesQuery = Requirement.find(
    {
      _id: { $ne: requirement._id },
      matchKey: requirement.matchKey,
      skillKeys: { $in: requirement.skillKeys },
      autoGroupOptOut: false,
      ...groupable,
    } as never,
  ).select('_id groupId').lean<{ _id: Types.ObjectId; groupId: Types.ObjectId | null }[]>();
  const matches = await (session ? matchesQuery.session(session) : matchesQuery);
  if (matches.length === 0) {
    return;
  }

  let groupId = matches.find((match) => match.groupId)?.groupId ?? null;
  if (!groupId) {
    const group = new RequirementGroup({ reason: 'auto' });
    await group.save({ session });
    groupId = group._id;
  }
  const ungrouped = matches.filter((match) => !match.groupId).map((match) => match._id);
  const updateQuery = Requirement.updateMany(
    { _id: { $in: [requirement._id, ...ungrouped] } } as never,
    { $set: { groupId } },
  );
  await (session ? updateQuery.session(session) : updateQuery);
}

export async function groupManually(
  requirementIds: Types.ObjectId[],
  createdBy: Types.ObjectId,
  session?: ClientSession,
): Promise<Types.ObjectId> {
  const requirementsQuery = Requirement.find({ _id: { $in: requirementIds }, ...groupable } as never)
    .select('_id groupId')
    .lean<{ _id: Types.ObjectId; groupId: Types.ObjectId | null }[]>();
  const requirements = await (session ? requirementsQuery.session(session) : requirementsQuery);
  if (requirements.length !== requirementIds.length) {
    throw new HttpError(400, 'Only published, existing requirements can be grouped');
  }

  const previousGroups = [...new Set(requirements.map((r) => r.groupId?.toString()).filter(Boolean))];
  const group = new RequirementGroup({ reason: 'manual', createdBy });
  await group.save({ session });
  const updateQuery = Requirement.updateMany(
    { _id: { $in: requirementIds } } as never,
    { $set: { groupId: group!._id, autoGroupOptOut: false } },
  );
  await (session ? updateQuery.session(session) : updateQuery);
  for (const previous of previousGroups) {
    await refreshGroup(requirements.find((r) => r.groupId?.toString() === previous)!.groupId, session);
  }
  return group._id;
}

export async function ungroup(requirementId: Types.ObjectId, session?: ClientSession): Promise<void> {
  const updateQuery = Requirement.findOneAndUpdate(
    { _id: requirementId } as never,
    { $set: { groupId: null, autoGroupOptOut: true } },
  ).lean<{ groupId: Types.ObjectId | null }>();
  const requirement = await (session ? updateQuery.session(session) : updateQuery);
  await refreshGroup(requirement?.groupId, session);
}

/** Possible repeats worth reviewing: same city, start within three days, at least one shared skill. */
export async function findSimilar(requirement: RequirementDoc, visible: object): Promise<RequirementDoc[]> {
  const day = 24 * 60 * 60 * 1000;
  const start = requirement.startDate.getTime();
  const city = requirement.city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Requirement.find({
    $and: [
      visible,
      {
        _id: { $ne: requirement._id },
        city: { $regex: `^${city}$`, $options: 'i' },
        startDate: { $gte: new Date(start - 3 * day), $lte: new Date(start + 3 * day) },
        skillKeys: { $in: requirement.skillKeys },
        status: { $ne: 'Draft' },
        ...(requirement.groupId ? { groupId: { $ne: requirement.groupId } } : {}),
      },
    ],
  } as never)
    .limit(10)
    .lean<RequirementDoc[]>();
}
