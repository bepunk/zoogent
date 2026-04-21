import { getDb } from '../src/db/index.js';
import { teams, agents, skills, agentSkills, agentIntegrations, teamSettings } from '../src/db/schema.js';
import { randomBytes } from 'node:crypto';
import { encrypt, loadMasterKey } from '../src/lib/crypto.js';

export function createTestTeam(name = 'Test Team') {
  const db = getDb();
  const id = randomBytes(8).toString('hex');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  db.insert(teams).values({ id, name, slug }).run();
  return { id, name, slug };
}

export function createTestAgent(
  teamId: string,
  overrides: Partial<{ id: string; name: string; command: string; type: string; runtime: 'typescript' | 'exec' }> = {},
) {
  const db = getDb();
  const id = overrides.id || `agent-${randomBytes(4).toString('hex')}`;
  const runtime = overrides.runtime ?? 'exec'; // legacy behavior: existing tests use echo/command
  db.insert(agents).values({
    id,
    name: overrides.name || id,
    teamId,
    runtime,
    command: runtime === 'exec' ? (overrides.command || 'echo') : null,
    args: runtime === 'exec' ? JSON.stringify(['hello']) : null,
    type: overrides.type || 'manual',
  }).run();
  return id;
}

export function createTestSkill(teamId: string, path?: string) {
  const db = getDb();
  const skillPath = path || `test/skill-${randomBytes(4).toString('hex')}.md`;
  db.insert(skills).values({
    path: skillPath,
    name: 'Test Skill',
    description: 'A test skill',
    category: 'test',
    content: '# Test Skill\n\nTest content.',
    contentHash: randomBytes(16).toString('hex'),
    teamId,
  }).run();
  return skillPath;
}

export function setTeamSetting(teamId: string, key: string, value: string, shouldEncrypt = false) {
  const db = getDb();
  const dataDir = process.env.DATA_DIR || './data';
  let storedValue = value;
  let encrypted = false;
  if (shouldEncrypt) {
    const masterKey = loadMasterKey(dataDir);
    storedValue = encrypt(value, masterKey);
    encrypted = true;
  }
  db.insert(teamSettings).values({ teamId, key, value: storedValue, encrypted }).run();
}
