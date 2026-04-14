import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { getDb } from '../db/index.js';
import { skills, agentSkills, agents } from '../db/schema.js';
import { validateSkillPath, parseFrontmatter, stripFrontmatter } from '../lib/skills.js';

export const apiSkillsRoutes = new Hono();

// GET /api/skills — list all skills for this team
apiSkillsRoutes.get('/', async (c) => {
  const db = getDb();
  const teamId = c.get('teamId' as any);
  const allSkills = db.select({
    id: skills.id,
    path: skills.path,
    name: skills.name,
    description: skills.description,
    category: skills.category,
    related: skills.related,
    updatedAt: skills.updatedAt,
  }).from(skills).where(eq(skills.teamId, teamId)).all();
  return c.json(allSkills);
});

// POST /api/skills — create skill (DB-first)
apiSkillsRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const { path, name, description, content, category, related } = body;
  const teamId = c.get('teamId' as any);

  if (!path || !content) return c.json({ error: 'path and content are required' }, 400);
  if (!validateSkillPath(path)) return c.json({ error: 'Invalid skill path' }, 400);

  const db = getDb();
  const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  db.insert(skills).values({
    teamId,
    path,
    name: name || path,
    description: description || '',
    content,
    category: category || 'general',
    related: related ? JSON.stringify(related) : null,
    contentHash,
  }).onConflictDoUpdate({
    target: [skills.teamId, skills.path],
    set: {
      name: name || path,
      description: description || '',
      content,
      category: category || 'general',
      related: related ? JSON.stringify(related) : null,
      contentHash,
      updatedAt: new Date(),
    },
  }).run();

  return c.json({ ok: true, path }, 201);
});

// GET /api/skills/:path{.+} — get skill content from DB
apiSkillsRoutes.get('/:path{.+}', async (c) => {
  const skillPath = c.req.param('path');
  const teamId = c.get('teamId' as any);

  const db = getDb();
  const skill = db.select().from(skills).where(and(eq(skills.teamId, teamId), eq(skills.path, skillPath))).get();
  if (!skill) return c.json({ error: 'Skill not found' }, 404);

  const body = skill.content ? stripFrontmatter(skill.content) : '';

  const usedBy = db
    .select({ agentId: agentSkills.agentId, agentName: agents.name })
    .from(agentSkills)
    .leftJoin(agents, eq(agentSkills.agentId, agents.id))
    .where(eq(agentSkills.skillPath, skillPath))
    .all();

  return c.json({
    path: skillPath,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    content: body,
    rawContent: skill.content || '',
    usedBy,
  });
});

// PUT /api/skills/:path{.+} — update skill content in DB
apiSkillsRoutes.put('/:path{.+}', async (c) => {
  const skillPath = c.req.param('path');
  const body = await c.req.json();
  const { content } = body;
  const teamId = c.get('teamId' as any);

  if (!content || typeof content !== 'string') {
    return c.json({ error: 'content is required' }, 400);
  }

  const db = getDb();
  const existing = db.select().from(skills).where(and(eq(skills.teamId, teamId), eq(skills.path, skillPath))).get();
  if (!existing) return c.json({ error: 'Skill not found' }, 404);

  const fm = parseFrontmatter(content);
  const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  db.update(skills).set({
    content,
    name: fm.name || null,
    description: fm.description || null,
    category: fm.category || null,
    related: fm.related ? JSON.stringify(fm.related) : null,
    contentHash,
    updatedAt: new Date(),
  }).where(and(eq(skills.teamId, teamId), eq(skills.path, skillPath))).run();

  return c.json({ ok: true, path: skillPath });
});

// DELETE /api/skills/:path{.+} — delete skill
apiSkillsRoutes.delete('/:path{.+}', async (c) => {
  const skillPath = c.req.param('path');
  const teamId = c.get('teamId' as any);
  const db = getDb();
  const deleted = db.delete(skills).where(and(eq(skills.teamId, teamId), eq(skills.path, skillPath))).returning().get();
  if (!deleted) return c.json({ error: 'Skill not found' }, 404);
  return c.json({ ok: true });
});

