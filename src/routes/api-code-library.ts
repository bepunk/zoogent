import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { getDb } from '../db/index.js';
import { teamCodeLibrary } from '../db/schema.js';

export const apiCodeLibraryRoutes = new Hono();

// GET / — list all files (no content)
apiCodeLibraryRoutes.get('/', (c) => {
  const db = getDb();
  const teamId = c.get('teamId' as any);
  const files = db.select({
    id: teamCodeLibrary.id,
    path: teamCodeLibrary.path,
    updatedAt: teamCodeLibrary.updatedAt,
  }).from(teamCodeLibrary).where(eq(teamCodeLibrary.teamId, teamId)).all();
  return c.json(files);
});

// POST / — upsert file { path, content }
apiCodeLibraryRoutes.post('/', async (c) => {
  const db = getDb();
  const teamId = c.get('teamId' as any);
  const { path, content } = await c.req.json();
  if (!path || typeof path !== 'string') return c.json({ error: 'path is required' }, 400);
  if (content === undefined || typeof content !== 'string') return c.json({ error: 'content is required' }, 400);

  const now = new Date();
  db.insert(teamCodeLibrary)
    .values({ id: randomBytes(8).toString('hex'), teamId, path, content, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [teamCodeLibrary.teamId, teamCodeLibrary.path],
      set: { content, updatedAt: now },
    }).run();

  const file = db.select().from(teamCodeLibrary)
    .where(and(eq(teamCodeLibrary.teamId, teamId), eq(teamCodeLibrary.path, path))).get();
  return c.json(file, 200);
});

// GET /file?path= — get single file with content
apiCodeLibraryRoutes.get('/file', (c) => {
  const db = getDb();
  const teamId = c.get('teamId' as any);
  const path = c.req.query('path');
  if (!path) return c.json({ error: 'path query param required' }, 400);

  const file = db.select().from(teamCodeLibrary)
    .where(and(eq(teamCodeLibrary.teamId, teamId), eq(teamCodeLibrary.path, path))).get();
  if (!file) return c.json({ error: 'Not found' }, 404);
  return c.json(file);
});

// DELETE /file?path= — delete file
apiCodeLibraryRoutes.delete('/file', (c) => {
  const db = getDb();
  const teamId = c.get('teamId' as any);
  const path = c.req.query('path');
  if (!path) return c.json({ error: 'path query param required' }, 400);

  db.delete(teamCodeLibrary)
    .where(and(eq(teamCodeLibrary.teamId, teamId), eq(teamCodeLibrary.path, path))).run();
  return c.json({ ok: true });
});
