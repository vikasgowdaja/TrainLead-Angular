import type { RequestHandler, Request } from 'express';
import type { OrgMemberRole, Role } from '@trainlead/shared';
import { Types } from 'mongoose';
import { User } from '../models/user.js';
import { HttpError } from '../http.js';

export interface Actor {
  userId: Types.ObjectId;
  role: Role;
  organizationId: Types.ObjectId | null;
  orgRole: OrgMemberRole | null;
}

declare global {
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

/** Loads organization membership, which can change after the access token was issued. Use after requireAuth. */
export const loadActor: RequestHandler = async (request, response, next) => {
  const claims = request.user;
  if (!claims) {
    response.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = await User.findOne({ _id: claims.userId, deletedAt: null }).select('organizationId orgRole').lean();
  if (!user) {
    response.status(401).json({ error: 'Account no longer exists' });
    return;
  }

  request.actor = {
    userId: new Types.ObjectId(claims.userId),
    role: claims.role,
    organizationId: user.organizationId ?? null,
    orgRole: (user.orgRole as OrgMemberRole | null) ?? null,
  };
  next();
};

export function actorOf(request: Request): Actor {
  if (!request.actor) {
    throw new HttpError(401, 'Authentication required');
  }
  return request.actor;
}

export function requireOrganization(actor: Actor): Types.ObjectId {
  if (!actor.organizationId) {
    throw new HttpError(409, 'Create or join an organization first');
  }
  return actor.organizationId;
}
