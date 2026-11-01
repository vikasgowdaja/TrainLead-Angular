import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import type { Actor } from '../auth/actor.js';
import { canManageRequirement, canViewRequirementCommercials } from './access.js';

describe('requirement access policies', () => {
  const organizationId = new Types.ObjectId();
  const otherOrganizationId = new Types.ObjectId();
  const requirement = { organizationId };
  const actor = (role: Actor['role'], actorOrganizationId: Types.ObjectId | null = null): Actor => ({
    userId: new Types.ObjectId(),
    role,
    organizationId: actorOrganizationId,
    orgRole: role === 'Vendor' && actorOrganizationId ? 'owner' : null,
  });

  it('lets trainers view commercials without granting management access', () => {
    const trainer = actor('Trainer');

    expect(canViewRequirementCommercials(trainer, requirement)).toBe(true);
    expect(canManageRequirement(trainer, requirement)).toBe(false);
  });

  it('limits vendor access to the posting organization and allows admins', () => {
    expect(canViewRequirementCommercials(actor('Vendor', organizationId), requirement)).toBe(true);
    expect(canViewRequirementCommercials(actor('Vendor', otherOrganizationId), requirement)).toBe(false);
    expect(canViewRequirementCommercials(actor('Viewer'), requirement)).toBe(false);
    expect(canViewRequirementCommercials(actor('Admin'), requirement)).toBe(true);
  });
});