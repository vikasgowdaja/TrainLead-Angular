import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { RoleSchema, type Role } from '@trainlead/shared';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AccessClaims {
  userId: string;
  role: Role;
}

export interface RefreshClaims {
  userId: string;
  tokenId: string;
}

function readSecret(name: string): string {
  const value = process.env[name];
  if (value) {
    if (value.length < 32) {
      throw new Error(`${name} must be at least 32 characters long.`);
    }
    return value;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is required in production.`);
  }

  // Lets a fresh clone run without setup; every server restart signs everyone out.
  return randomBytes(32).toString('hex');
}

const accessSecret = readSecret('JWT_ACCESS_SECRET');
const refreshSecret = readSecret('JWT_REFRESH_SECRET');

function readSubject(payload: string | jwt.JwtPayload): jwt.JwtPayload & { sub: string } {
  if (typeof payload === 'string' || !payload.sub) {
    throw new Error('Token has no subject.');
  }
  return payload as jwt.JwtPayload & { sub: string };
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign({ role: claims.role }, accessSecret, {
    algorithm: 'HS256',
    subject: claims.userId,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  const payload = readSubject(jwt.verify(token, accessSecret, { algorithms: ['HS256'] }));
  return { userId: payload.sub, role: RoleSchema.parse(payload['role']) };
}

export function signRefreshToken(claims: RefreshClaims): string {
  return jwt.sign({}, refreshSecret, {
    algorithm: 'HS256',
    subject: claims.userId,
    jwtid: claims.tokenId,
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function verifyRefreshToken(token: string): RefreshClaims {
  const payload = readSubject(jwt.verify(token, refreshSecret, { algorithms: ['HS256'] }));
  if (!payload.jti) {
    throw new Error('Refresh token has no id.');
  }
  return { userId: payload.sub, tokenId: payload.jti };
}
