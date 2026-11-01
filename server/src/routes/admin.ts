import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { User } from '../models/user.js';

const router = Router();

router.use(requireAuth, requireRole('Admin'));

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
