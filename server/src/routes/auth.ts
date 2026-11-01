import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router, type CookieOptions, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { LoginSchema, RegisterSchema, type AuthSession, type AuthUser, type Role } from '@trainlead/shared';
import { User } from '../models/user.js';
import { requireAuth } from '../auth/middleware.js';
import {
  REFRESH_TOKEN_TTL_SECONDS,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../auth/tokens.js';

const router = Router();
const BCRYPT_ROUNDS = 12;
const REFRESH_COOKIE = 'tl_refresh';

const refreshCookie: CookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/api/auth',
};

// Comparing against a real hash when the user is unknown keeps response times similar.
const dummyHash = bcrypt.hash('timing-equaliser', BCRYPT_ROUNDS);

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
});

interface UserLike {
  _id: unknown;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: string;
}

function toAuthUser(user: UserLike): AuthUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email ?? null,
    phone: user.phone ?? null,
    role: user.role as Role,
  };
}

async function startSession(response: Response, user: UserLike): Promise<AuthSession> {
  const authUser = toAuthUser(user);
  const tokenId = randomUUID();
  await User.updateOne({ _id: authUser.id }, { $set: { refreshTokenId: tokenId } });

  response.cookie(REFRESH_COOKIE, signRefreshToken({ userId: authUser.id, tokenId }), {
    ...refreshCookie,
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
  return { user: authUser, accessToken: signAccessToken({ userId: authUser.id, role: authUser.role }) };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
}

router.post('/register', credentialLimiter, async (request, response) => {
  const parsed = RegisterSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid registration details', issues: parsed.error.issues });
    return;
  }

  const { name, email, phone, password, role } = parsed.data;
  try {
    const user = await User.create({
      name,
      email,
      phone,
      role,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    });
    response.status(201).json({ data: await startSession(response, user) });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      response.status(409).json({ error: 'An account with this email or phone already exists' });
      return;
    }
    throw error;
  }
});

router.post('/login', credentialLimiter, async (request, response) => {
  const parsed = LoginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid login details', issues: parsed.error.issues });
    return;
  }

  const { identifier, password } = parsed.data;
  const lookup = identifier.includes('@') ? { email: identifier.toLowerCase() } : { phone: identifier };
  const user = await User.findOne({ ...lookup, deletedAt: null }).select('+passwordHash');
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? (await dummyHash));

  if (!user || !passwordMatches) {
    response.status(401).json({ error: 'Email/phone or password is incorrect' });
    return;
  }

  response.json({ data: await startSession(response, user) });
});

router.post('/refresh', async (request, response) => {
  const token: unknown = request.cookies?.[REFRESH_COOKIE];
  let claims;
  try {
    claims = verifyRefreshToken(typeof token === 'string' ? token : '');
  } catch {
    response.clearCookie(REFRESH_COOKIE, refreshCookie);
    response.status(401).json({ error: 'Session expired. Please sign in again' });
    return;
  }

  const user = await User.findOne({ _id: claims.userId, deletedAt: null }).select('+refreshTokenId');
  if (!user || user.refreshTokenId !== claims.tokenId) {
    // An old token being replayed may mean it was stolen, so end the session entirely.
    if (user) {
      await User.updateOne({ _id: user._id }, { $set: { refreshTokenId: null } });
    }
    response.clearCookie(REFRESH_COOKIE, refreshCookie);
    response.status(401).json({ error: 'Session expired. Please sign in again' });
    return;
  }

  response.json({ data: await startSession(response, user) });
});

router.post('/logout', async (request, response) => {
  const token: unknown = request.cookies?.[REFRESH_COOKIE];
  try {
    const claims = verifyRefreshToken(typeof token === 'string' ? token : '');
    await User.updateOne(
      { _id: claims.userId, refreshTokenId: claims.tokenId },
      { $set: { refreshTokenId: null } },
    );
  } catch {
    // Already signed out or token expired; clearing the cookie is all that is left to do.
  }
  response.clearCookie(REFRESH_COOKIE, refreshCookie);
  response.status(204).end();
});

router.get('/me', requireAuth, async (request, response) => {
  const user = await User.findOne({ _id: request.user?.userId, deletedAt: null }).lean();
  if (!user) {
    response.status(404).json({ error: 'User not found' });
    return;
  }
  response.json({ data: toAuthUser(user) });
});

export { router as authRouter };
