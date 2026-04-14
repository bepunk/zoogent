import type { Context, Next } from 'hono';
import { getAuth } from './auth.js';
import { timeSafeCompare } from './crypto.js';
import { getDb } from '../db/index.js';
import { apiKeys } from '../db/schema.js';

/**
 * Unified auth middleware.
 * - localhost requests (127.0.0.1 / ::1) → pass through (MCP)
 * - API key in Authorization header → validate against api_keys table
 * - Session cookie → validate via Better Auth
 */
export async function unifiedAuth(c: Context, next: Next) {
  // Localhost bypass (MCP process on same machine)
  const host = c.req.header('host') || '';
  const isLocalhost = host.startsWith('127.0.0.1') || host.startsWith('localhost') || host.startsWith('[::1]');
  if (isLocalhost) {
    return next();
  }

  // API key auth (agents, remote MCP)
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const provided = authHeader.slice(7);
    const db = getDb();
    const keys = db.select().from(apiKeys).all();

    if (keys.length === 0) {
      return c.json({ error: 'No API keys configured. Generate one in Settings.' }, 401);
    }

    for (const k of keys) {
      if (timeSafeCompare(provided, k.key)) {
        return next();
      }
    }
    return c.json({ error: 'Invalid API key' }, 401);
  }

  // Session auth (dashboard)
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session) {
      c.set('userId' as any, session.user.id);
      return next();
    }
  } catch {
    // Auth not configured (e.g. no BETTER_AUTH_SECRET) — fall through
  }

  return c.json({ error: 'Unauthorized' }, 401);
}
