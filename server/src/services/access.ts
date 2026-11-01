import type { Types } from 'mongoose';
import type { Actor } from '../auth/actor.js';
import type { RequirementDoc } from '../models/requirement.js';

/** Which requirements an actor may see at all. Every list, count and detail query starts from this. */
export function visibilityFilter(actor: Actor): Record<string, unknown> {
  if (actor.role === 'Admin') {
    return { deletedAt: null };
  }
  if (actor.role === 'Vendor' && actor.organizationId) {
    return { deletedAt: null, $or: [{ organizationId: actor.organizationId }, { status: 'Open' }] };
  }
  return { deletedAt: null, status: 'Open' };
}

export function isOwnOrganization(actor: Actor, organizationId: Types.ObjectId | null | undefined): boolean {
  return Boolean(organizationId && actor.organizationId?.equals(organizationId));
}

/** Edit, delete, change status and see private terms (rates, contacts, original messages). */
export function canManageRequirement(actor: Actor, requirement: { organizationId: Types.ObjectId }): boolean {
  return actor.role === 'Admin' || (actor.role === 'Vendor' && isOwnOrganization(actor, requirement.organizationId));
}

export function canSeeRequirement(actor: Actor, requirement: { organizationId: Types.ObjectId; status: string; deletedAt?: Date | null }): boolean {
  if (requirement.deletedAt) {
    return false;
  }
  return requirement.status === 'Open' || canManageRequirement(actor, requirement);
}
