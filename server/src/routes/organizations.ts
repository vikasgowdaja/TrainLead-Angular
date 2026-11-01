import { Router } from 'express';
import { AddMemberSchema, OrganizationInputSchema, VerificationUpdateSchema } from '@trainlead/shared';
import { requireAuth } from '../auth/middleware.js';
import { actorOf, loadActor, requireOrganization } from '../auth/actor.js';
import { withTransaction } from '../database.js';
import { forbidden, HttpError, notFound, objectId, parseBody } from '../http.js';
import { Organization, organizationName } from '../models/organization.js';
import { User } from '../models/user.js';

const router = Router();
router.use(requireAuth, loadActor);

function canManageMembers(actor: ReturnType<typeof actorOf>): boolean {
  return actor.role === 'Admin' || actor.orgRole === 'owner';
}

function presentOrganization(organization: Record<string, unknown>, myRole: string | null) {
  return {
    id: String(organization['_id']),
    name: organizationName({ legalName: String(organization['legalName']), brandName: String(organization['brandName'] ?? '') }),
    legalName: organization['legalName'],
    brandName: organization['brandName'],
    type: organization['type'],
    city: organization['city'],
    state: organization['state'],
    website: organization['website'] ?? null,
    primaryContactName: organization['primaryContactName'],
    email: organization['email'] ?? null,
    phone: organization['phone'] ?? null,
    gstin: organization['gstin'] ?? null,
    pan: organization['pan'] ?? null,
    verificationStatus: organization['verificationStatus'],
    verificationNote: organization['verificationNote'] ?? null,
    myRole,
    createdAt: (organization['createdAt'] as Date).toISOString(),
    updatedAt: (organization['updatedAt'] as Date).toISOString(),
  };
}

async function getOwnOrganization(actor: ReturnType<typeof actorOf>) {
  const id = requireOrganization(actor);
  const organization = await Organization.findOne({ _id: id, deletedAt: null } as never).lean();
  if (!organization) throw notFound('Organization');
  return organization;
}

router.post('/', async (request, response) => {
  const actor = actorOf(request);
  if (actor.role !== 'Vendor' && actor.role !== 'Admin') throw forbidden('Only vendors can create an organization');
  if (actor.role === 'Vendor' && actor.organizationId) throw new HttpError(409, 'Your account already belongs to an organization');
  const input = parseBody(OrganizationInputSchema, request.body, 'organization');
  const organization = await withTransaction(async (session) => {
    const nameKey = (input.brandName || input.legalName).normalize('NFKC').trim().toLowerCase();
    const created = new Organization({ ...input, nameKey, createdBy: actor.userId, verificationStatus: 'Pending' });
    await created.save({ session });
    if (actor.role === 'Vendor') {
      const update = User.updateOne(
        { _id: actor.userId, organizationId: null } as never,
        { $set: { organizationId: created._id, orgRole: 'owner' } },
      );
      const result = await (session ? update.session(session) : update);
      if (result.modifiedCount !== 1) throw new HttpError(409, 'Account organization changed; refresh and try again');
    }
    return created;
  });
  response.status(201).json({ data: presentOrganization(organization.toObject(), actor.role === 'Vendor' ? 'owner' : null) });
});

router.get('/me', async (request, response) => {
  const actor = actorOf(request);
  const organization = await getOwnOrganization(actor);
  response.json({ data: presentOrganization(organization as unknown as Record<string, unknown>, actor.orgRole) });
});

router.put('/me', async (request, response) => {
  const actor = actorOf(request);
  const organization = await getOwnOrganization(actor);
  if (!canManageMembers(actor)) throw forbidden('Only an organization owner can edit organization details');
  const input = parseBody(OrganizationInputSchema, request.body, 'organization');
  const updated = await Organization.findOneAndUpdate(
    { _id: organization['_id'], deletedAt: null } as never,
    {
      $set: {
        ...input,
        nameKey: (input.brandName || input.legalName).normalize('NFKC').trim().toLowerCase(),
      },
    },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) throw notFound('Organization');
  response.json({ data: presentOrganization(updated as unknown as Record<string, unknown>, actor.orgRole) });
});

router.patch('/me/verification', async (request, response) => {
  const actor = actorOf(request);
  const organization = await getOwnOrganization(actor);
  const input = parseBody(VerificationUpdateSchema, request.body, 'verification');
  if (actor.role !== 'Admin' && input.verificationStatus !== 'Pending') {
    throw forbidden('Only an Admin can verify or reject an organization');
  }
  if (actor.role !== 'Admin' && !canManageMembers(actor)) throw forbidden('Only an organization owner can submit verification');
  const updated = await Organization.findByIdAndUpdate(
    organization['_id'],
    { $set: input },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) throw notFound('Organization');
  response.json({ data: presentOrganization(updated as unknown as Record<string, unknown>, actor.orgRole) });
});

router.get('/me/members', async (request, response) => {
  const actor = actorOf(request);
  const organizationId = requireOrganization(actor);
  const users = await User.find({ organizationId, deletedAt: null } as never)
    .select('name email phone orgRole')
    .sort({ name: 1 })
    .lean();
  response.json({
    data: users.map((user) => ({
      userId: String(user['_id']),
      name: user['name'],
      email: user['email'] ?? null,
      phone: user['phone'] ?? null,
      orgRole: user['orgRole'],
    })),
  });
});

router.post('/me/members', async (request, response) => {
  const actor = actorOf(request);
  if (!canManageMembers(actor)) throw forbidden('Only an organization owner can add members');
  const organizationId = requireOrganization(actor);
  const input = parseBody(AddMemberSchema, request.body, 'member');
  const lookup = input.identifier.includes('@')
    ? { email: input.identifier.trim().toLowerCase() }
    : { phone: input.identifier.trim() };
  const member = await User.findOneAndUpdate(
    { ...lookup, role: 'Vendor', organizationId: null, deletedAt: null } as never,
    { $set: { organizationId, orgRole: input.orgRole } },
    { new: true },
  ).select('name email phone orgRole');
  if (!member) throw new HttpError(404, 'Unassigned Vendor account not found');
  response.status(201).json({
    data: {
      userId: String(member._id),
      name: member.name,
      email: member.email ?? null,
      phone: member.phone ?? null,
      orgRole: member.orgRole,
    },
  });
});

router.delete('/me/members/:userId', async (request, response) => {
  const actor = actorOf(request);
  if (!canManageMembers(actor)) throw forbidden('Only an organization owner can remove members');
  const organizationId = requireOrganization(actor);
  const userId = objectId(request.params['userId'], 'user id');
  if (userId.equals(actor.userId)) throw new HttpError(409, 'You cannot remove your own account');
  const removed = await User.findOneAndUpdate(
    { _id: userId, organizationId, orgRole: { $ne: 'owner' }, deletedAt: null } as never,
    { $set: { organizationId: null, orgRole: null } },
  );
  if (!removed) throw notFound('Organization member');
  response.status(204).end();
});

router.get('/:id', async (request, response) => {
  const actor = actorOf(request);
  const id = objectId(request.params['id'], 'organization id');
  if (actor.role !== 'Admin' && !actor.organizationId?.equals(id)) throw forbidden();
  const organization = await Organization.findOne({ _id: id, deletedAt: null } as never).lean();
  if (!organization) throw notFound('Organization');
  response.json({ data: presentOrganization(organization as unknown as Record<string, unknown>, actor.organizationId?.equals(id) ? actor.orgRole : null) });
});

export { router as organizationsRouter };
