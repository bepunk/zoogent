import { describe, it, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { teamSettings } from '../src/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { encrypt, decrypt, loadMasterKey } from '../src/lib/crypto.js';
import { createTestTeam } from './helpers.js';

describe('Team Settings', () => {
  const dataDir = process.env.DATA_DIR || '/tmp/zoogent-test-data';

  it('stores and retrieves Anthropic API key encrypted', () => {
    const team = createTestTeam('Anthropic Key Team');
    const db = getDb();
    const masterKey = loadMasterKey(dataDir);
    const apiKey = 'sk-ant-api03-test-key-here-long-enough';

    const encryptedValue = encrypt(apiKey, masterKey);
    db.insert(teamSettings).values({
      teamId: team.id,
      key: 'anthropic_api_key',
      value: encryptedValue,
      encrypted: true,
    }).run();

    const setting = db.select().from(teamSettings)
      .where(and(eq(teamSettings.teamId, team.id), eq(teamSettings.key, 'anthropic_api_key')))
      .get();

    expect(setting).toBeDefined();
    expect(setting!.encrypted).toBe(true);
    expect(setting!.value).not.toBe(apiKey);
    expect(decrypt(setting!.value, masterKey)).toBe(apiKey);
  });

  it('stores auto_approve_knowledge setting', () => {
    const team = createTestTeam('Auto Approve Team');
    const db = getDb();
    db.insert(teamSettings).values({
      teamId: team.id,
      key: 'auto_approve_knowledge',
      value: 'true',
    }).run();

    const setting = db.select().from(teamSettings)
      .where(and(eq(teamSettings.teamId, team.id), eq(teamSettings.key, 'auto_approve_knowledge')))
      .get();

    expect(setting!.value).toBe('true');
    expect(setting!.encrypted).toBe(false);
  });

  it('team A settings are not visible from team B', () => {
    const teamA = createTestTeam('Settings Iso A');
    const teamB = createTestTeam('Settings Iso B');
    const db = getDb();

    db.insert(teamSettings).values({
      teamId: teamA.id,
      key: 'anthropic_api_key',
      value: 'team-a-key',
    }).run();

    const settingB = db.select().from(teamSettings)
      .where(and(eq(teamSettings.teamId, teamB.id), eq(teamSettings.key, 'anthropic_api_key')))
      .get();

    expect(settingB).toBeUndefined();
  });

  it('updates existing setting via upsert pattern', () => {
    const team = createTestTeam('Upsert Team');
    const db = getDb();

    db.insert(teamSettings).values({ teamId: team.id, key: 'test_val', value: 'v1' }).run();

    // Update
    db.update(teamSettings)
      .set({ value: 'v2', updatedAt: new Date() })
      .where(and(eq(teamSettings.teamId, team.id), eq(teamSettings.key, 'test_val')))
      .run();

    const setting = db.select().from(teamSettings)
      .where(and(eq(teamSettings.teamId, team.id), eq(teamSettings.key, 'test_val')))
      .get();

    expect(setting!.value).toBe('v2');
  });

  it('deletes setting', () => {
    const team = createTestTeam('Delete Setting Team');
    const db = getDb();

    db.insert(teamSettings).values({ teamId: team.id, key: 'to_delete', value: 'temp' }).run();
    db.delete(teamSettings)
      .where(and(eq(teamSettings.teamId, team.id), eq(teamSettings.key, 'to_delete')))
      .run();

    const setting = db.select().from(teamSettings)
      .where(and(eq(teamSettings.teamId, team.id), eq(teamSettings.key, 'to_delete')))
      .get();

    expect(setting).toBeUndefined();
  });
});
