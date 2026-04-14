import { describe, it, expect } from 'vitest';
import app from '../src/index.js';
import { getDb } from '../src/db/index.js';
import { apiKeys } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

const TEST_KEY = process.env.ZOOGENT_API_KEY || 'zg_test-key-for-testing';

function req(path: string, options?: RequestInit & { apiKey?: string }) {
  const key = options?.apiKey ?? TEST_KEY;
  const { apiKey: _, ...restOptions } = options || {};
  return app.request(path, {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'Authorization': `Bearer ${key}` } : {}),
      ...restOptions?.headers,
    },
  });
}

describe('API Key Auth', () => {
  it('rejects requests with no API key (non-localhost)', async () => {
    const res = await app.request('/api/teams', {
      headers: { 'Host': 'remote.example.com' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects requests with invalid API key', async () => {
    const res = await app.request('/api/teams', {
      headers: {
        'Host': 'remote.example.com',
        'Authorization': 'Bearer zg_invalid-key',
      },
    });
    expect(res.status).toBe(401);
  });

  it('accepts requests with valid API key from DB', async () => {
    const res = await req('/api/teams');
    expect(res.status).toBe(200);
  });

  it('supports multiple API keys', async () => {
    const db = getDb();
    const secondKey = `zg_${randomBytes(24).toString('hex')}`;
    db.insert(apiKeys).values({ id: 'second-key', name: 'Second', key: secondKey }).run();

    // Both keys should work
    const res1 = await req('/api/teams', { apiKey: TEST_KEY });
    expect(res1.status).toBe(200);

    const res2 = await req('/api/teams', { apiKey: secondKey });
    expect(res2.status).toBe(200);

    // Clean up
    db.delete(apiKeys).where(eq(apiKeys.id, 'second-key')).run();
  });

  it('revoked key stops working', async () => {
    const db = getDb();
    const tempKey = `zg_${randomBytes(24).toString('hex')}`;
    db.insert(apiKeys).values({ id: 'temp-key', name: 'Temp', key: tempKey }).run();

    // Works before revoke
    const res1 = await req('/api/teams', { apiKey: tempKey });
    expect(res1.status).toBe(200);

    // Revoke
    db.delete(apiKeys).where(eq(apiKeys.id, 'temp-key')).run();

    // Fails after revoke
    const res2 = await app.request('/api/teams', {
      headers: {
        'Host': 'remote.example.com',
        'Authorization': `Bearer ${tempKey}`,
      },
    });
    expect(res2.status).toBe(401);
  });
});
