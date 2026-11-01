import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { app } from './index.js';
import { signAccessToken, signRefreshToken, verifyAccessToken } from './auth/tokens.js';

const userId = '507f1f77bcf86cd799439011';

function bearer(role: 'Admin' | 'Vendor' | 'Trainer' | 'Viewer'): Record<string, string> {
  return { Authorization: `Bearer ${signAccessToken({ userId, role })}`, 'Content-Type': 'application/json' };
}

describe('authentication and authorization', () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it('round-trips the user id and role through an access token', () => {
    expect(verifyAccessToken(signAccessToken({ userId, role: 'Trainer' }))).toEqual({ userId, role: 'Trainer' });
  });

  it('rejects requirement requests without a token', async () => {
    const response = await fetch(`${baseUrl}/api/requirements`);

    expect(response.status).toBe(401);
  });

  it('rejects a refresh token used as an access token', async () => {
    const refreshToken = signRefreshToken({ userId, tokenId: 'abc' });
    const response = await fetch(`${baseUrl}/api/requirements`, {
      headers: { Authorization: `Bearer ${refreshToken}` },
    });

    expect(response.status).toBe(401);
  });

  it('forbids a Trainer from posting requirements', async () => {
    const response = await fetch(`${baseUrl}/api/requirements`, {
      method: 'POST',
      headers: bearer('Trainer'),
      body: '{}',
    });

    expect(response.status).toBe(403);
  });

  it('forbids a Vendor from editing shared opportunities', async () => {
    const response = await fetch(`${baseUrl}/api/requirements/${userId}`, {
      method: 'PUT',
      headers: bearer('Vendor'),
      body: '{}',
    });

    expect(response.status).toBe(403);
  });

  it.each(['Trainer', 'Vendor', 'Viewer'] as const)('forbids a %s from admin routes', async (role) => {
    const response = await fetch(`${baseUrl}/api/admin/users`, { headers: bearer(role) });

    expect(response.status).toBe(403);
  });

  it('validates login input before touching the database', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '', password: '' }),
    });

    expect(response.status).toBe(400);
  });

  it('refuses to refresh without a refresh cookie', async () => {
    const response = await fetch(`${baseUrl}/api/auth/refresh`, { method: 'POST' });

    expect(response.status).toBe(401);
  });
});
