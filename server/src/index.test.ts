import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { app } from './index.js';

describe('health endpoint', () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('returns a small service status without exposing configuration', async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: 'trainlead-api' });
  });

  it('returns JSON for unknown routes', async () => {
    const response = await fetch(`${baseUrl}/api/missing`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Route not found' });
  });
});