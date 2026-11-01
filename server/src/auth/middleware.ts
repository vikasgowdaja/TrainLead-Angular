import type { RequestHandler } from 'express';
import type { Role } from '@trainlead/shared';
import { verifyAccessToken, type AccessClaims } from './tokens.js';

declare global {
  namespace Express {
    interface Request {
      user?: AccessClaims;
    }
  }
}

export const requireAuth: RequestHandler = (request, response, next) => {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) {
    response.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    request.user = verifyAccessToken(token);
    next();
  } catch {
    response.status(401).json({ error: 'Invalid or expired token' });
  }
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (request, response, next) => {
    if (!request.user) {
      response.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(request.user.role)) {
      response.status(403).json({ error: 'You do not have permission to do this' });
      return;
    }
    next();
  };
}
