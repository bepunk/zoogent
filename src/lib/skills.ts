import { resolve } from 'node:path';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { skills } from '../db/schema.js';

// ─── Frontmatter Parsing ────────────────────────────────────────────────────

export function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) return content;
  return content.slice(endIndex + 3).trim();
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
  category?: string;
  related?: string[];
}

export function parseFrontmatter(content: string): SkillFrontmatter {
  if (!content.startsWith('---')) return {};
  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) return {};

  const yaml = content.slice(3, endIndex).trim();
  const result: SkillFrontmatter = {};

  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    switch (key) {
      case 'name': result.name = value; break;
      case 'description': result.description = value; break;
      case 'category': result.category = value; break;
      case 'related':
        if (value.startsWith('[')) {
          try { result.related = JSON.parse(value); } catch { result.related = []; }
        } else if (value === '') {
          result.related = [];
        }
        break;
    }
    if (key.startsWith('- ') && result.related !== undefined) {
      result.related.push(key.slice(2).trim());
    }
  }

  return result;
}

// ─── Path Safety ────────────────────────────────────────────────────────────

export function getSkillsDir(): string {
  return resolve(process.env.SKILLS_DIR || './data/skills');
}

export function validateSkillPath(requestedPath: string): string | null {
  if (requestedPath.includes('..') || requestedPath.includes('\0')) return null;
  if (!requestedPath.endsWith('.md')) return null;
  if (requestedPath.startsWith('/')) return null;
  return requestedPath;
}

// ─── DB-first Skill Loading ─────────────────────────────────────────────────

/** Load a single skill content from DB (strips frontmatter). */
export function loadSkill(skillPath: string, teamId?: string): string {
  const db = getDb();
  const conditions = [eq(skills.path, skillPath)];
  if (teamId) conditions.push(eq(skills.teamId, teamId));
  const skill = db.select().from(skills).where(and(...conditions)).get();
  if (!skill?.content) return '';
  return stripFrontmatter(skill.content);
}

/** Load multiple skills from DB, concatenated. */
export function loadSkills(paths: string[], teamId?: string): string {
  return paths.map(p => loadSkill(p, teamId)).filter(Boolean).join('\n\n---\n\n');
}

