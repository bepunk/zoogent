import { Hono } from 'hono';
import { eq, and, asc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { teams, teamMembers, teamSettings, users } from '../db/schema.js';
import { unifiedAuth } from '../lib/auth-middleware.js';
import { encrypt, decrypt, loadMasterKey } from '../lib/crypto.js';
import { randomBytes } from 'node:crypto';

export const apiTeamsRoutes = new Hono();

apiTeamsRoutes.use('*', unifiedAuth);

// GET /api/teams — list all teams
apiTeamsRoutes.get('/', async (c) => {
  const db = getDb();
  const allTeams = db.select().from(teams).orderBy(asc(teams.name)).all();
  return c.json(allTeams);
});

// POST /api/teams — create team
apiTeamsRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const { name, slug, description } = body;

  if (!name || !slug) {
    return c.json({ error: 'name and slug are required' }, 400);
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return c.json({ error: 'slug must be lowercase alphanumeric with dashes' }, 400);
  }

  const db = getDb();
  const id = randomBytes(8).toString('hex');

  try {
    const team = db.insert(teams).values({
      id,
      name,
      slug,
      description: description ?? null,
    }).returning().get();

    // Add creator as owner if userId available
    const userId = c.get('userId' as any);
    if (userId) {
      db.insert(teamMembers).values({
        teamId: id,
        userId,
        role: 'owner',
      }).run();
    }

    return c.json(team, 201);
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'Slug already taken' }, 409);
    }
    throw e;
  }
});

// GET /api/teams/:teamId — team detail
apiTeamsRoutes.get('/:teamId', async (c) => {
  const teamId = c.req.param('teamId');
  const db = getDb();
  const team = db.select().from(teams).where(eq(teams.id, teamId)).get();
  if (!team) return c.json({ error: 'Team not found' }, 404);

  const members = db.select({
    userId: teamMembers.userId,
    role: teamMembers.role,
    userName: users.name,
    userEmail: users.email,
  }).from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId))
    .all();

  return c.json({ ...team, members });
});

// PATCH /api/teams/:teamId — update team
apiTeamsRoutes.patch('/:teamId', async (c) => {
  const teamId = c.req.param('teamId');
  const body = await c.req.json();
  const db = getDb();

  const updates: any = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;

  const updated = db.update(teams).set(updates).where(eq(teams.id, teamId)).returning().get();
  if (!updated) return c.json({ error: 'Team not found' }, 404);
  return c.json(updated);
});

// POST /api/teams/:teamId/members — add member
apiTeamsRoutes.post('/:teamId/members', async (c) => {
  const teamId = c.req.param('teamId');
  const body = await c.req.json();
  const { userId, role } = body;

  if (!userId) return c.json({ error: 'userId is required' }, 400);

  const db = getDb();
  try {
    db.insert(teamMembers).values({
      teamId,
      userId,
      role: role || 'member',
    }).run();
    return c.json({ ok: true }, 201);
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'User is already a member' }, 409);
    }
    throw e;
  }
});

// GET /api/teams/:teamId/members — list members
apiTeamsRoutes.get('/:teamId/members', async (c) => {
  const teamId = c.req.param('teamId');
  const db = getDb();
  const members = db.select({
    userId: teamMembers.userId,
    role: teamMembers.role,
    userName: users.name,
    userEmail: users.email,
    createdAt: teamMembers.createdAt,
  }).from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId))
    .all();
  return c.json(members);
});

// DELETE /api/teams/:teamId/members/:userId — remove member
apiTeamsRoutes.delete('/:teamId/members/:userId', async (c) => {
  const teamId = c.req.param('teamId');
  const userId = c.req.param('userId');
  const db = getDb();
  db.delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .run();
  return c.json({ ok: true });
});

// ─── Team Settings ─────────────────────────────────────────────────────────────

// GET /api/teams/:teamId/settings — list settings (values masked if encrypted)
apiTeamsRoutes.get('/:teamId/settings', async (c) => {
  const teamId = c.req.param('teamId');
  const db = getDb();
  const all = db.select().from(teamSettings).where(eq(teamSettings.teamId, teamId)).all();

  return c.json(all.map(s => ({
    key: s.key,
    value: s.encrypted ? '••••••' : s.value,
    encrypted: s.encrypted,
    updatedAt: s.updatedAt,
  })));
});

// PUT /api/teams/:teamId/settings/:key — set a team setting
apiTeamsRoutes.put('/:teamId/settings/:key', async (c) => {
  const teamId = c.req.param('teamId');
  const key = c.req.param('key');
  const body = await c.req.json();
  const { value, encrypt: shouldEncrypt } = body;

  if (value === undefined) return c.json({ error: 'value is required' }, 400);

  const db = getDb();
  let storedValue = value;
  let encrypted = false;

  if (shouldEncrypt) {
    const dataDir = process.env.DATA_DIR || './data';
    const masterKey = loadMasterKey(dataDir);
    storedValue = encrypt(value, masterKey);
    encrypted = true;
  }

  // Upsert
  const existing = db.select().from(teamSettings)
    .where(and(eq(teamSettings.teamId, teamId), eq(teamSettings.key, key)))
    .get();

  if (existing) {
    db.update(teamSettings)
      .set({ value: storedValue, encrypted, updatedAt: new Date() })
      .where(and(eq(teamSettings.teamId, teamId), eq(teamSettings.key, key)))
      .run();
  } else {
    db.insert(teamSettings).values({
      teamId, key, value: storedValue, encrypted,
    }).run();
  }

  return c.json({ ok: true });
});

// DELETE /api/teams/:teamId/settings/:key — delete a setting
apiTeamsRoutes.delete('/:teamId/settings/:key', async (c) => {
  const teamId = c.req.param('teamId');
  const key = c.req.param('key');
  const db = getDb();
  db.delete(teamSettings)
    .where(and(eq(teamSettings.teamId, teamId), eq(teamSettings.key, key)))
    .run();
  return c.json({ ok: true });
});
