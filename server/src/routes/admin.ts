import { Router } from 'express';
import { REQUIREMENT_STATUSES } from '@trainlead/shared';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { InboxItem } from '../models/inbox-item.js';
import { Organization } from '../models/organization.js';
import { Requirement } from '../models/requirement.js';
import { RequirementSource } from '../models/requirement-source.js';
import { User } from '../models/user.js';

const router = Router();

router.use(requireAuth, requireRole('Admin'));

router.get('/analytics', async (_request, response) => {
  const [trainerAccounts, vendorAccounts, organizations, verifiedOrganizations, statusRows, opportunityRows, sourcePosts, inboxPending, latest] = await Promise.all([
    User.countDocuments({ role: 'Trainer', deletedAt: null }),
    User.countDocuments({ role: 'Vendor', deletedAt: null }),
    Organization.countDocuments({ deletedAt: null }),
    Organization.countDocuments({ deletedAt: null, verificationStatus: 'Verified' }),
    Requirement.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Requirement.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: { $ifNull: ['$groupId', '$_id'] }, statuses: { $addToSet: '$status' } } },
    ]),
    RequirementSource.countDocuments({ deletedAt: null }),
    InboxItem.countDocuments({ status: { $in: ['Pending', 'Extracted', 'Failed'] } }),
    Requirement.findOne({ deletedAt: null }).sort({ updatedAt: -1 }).select('updatedAt').lean(),
  ]);
  const requirementsByStatus = Object.fromEntries(REQUIREMENT_STATUSES.map((status) => [status, 0])) as Record<(typeof REQUIREMENT_STATUSES)[number], number>;
  for (const row of statusRows) {
    if (row['_id'] in requirementsByStatus) requirementsByStatus[row['_id'] as keyof typeof requirementsByStatus] = Number(row['count']);
  }
  const activeOpportunities = opportunityRows.filter((item) => item['statuses'].some((status: string) => status === 'Open' || status === 'Paused')).length;
  const lastUpdatedAt = (latest as unknown as { updatedAt?: Date } | null)?.updatedAt?.toISOString() ?? null;

  response.json({
    data: {
      trainerAccounts,
      vendorAccounts,
      organizations,
      verifiedOrganizations,
      totalRequirements: Object.values(requirementsByStatus).reduce((total, count) => total + count, 0),
      totalOpportunities: opportunityRows.length,
      activeOpportunities,
      requirementsByStatus,
      sourcePosts,
      inboxPending,
      lastUpdatedAt,
    },
  });
});

router.get('/users', async (_request, response) => {
  const users = await User.find({ deletedAt: null })
    .select('name email phone role createdAt')
    .sort({ createdAt: -1 })
    .lean();

  response.json({
    data: users.map((user) => ({
      id: String(user._id),
      name: user.name,
      email: user.email ?? null,
      phone: user.phone ?? null,
      role: user.role,
      createdAt: user.createdAt,
    })),
  });
});

export { router as adminRouter };
