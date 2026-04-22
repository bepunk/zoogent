import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/index.js';
import { agents } from '../src/db/schema.js';
import {
  setAgentCode,
  getAgentCode,
  materializeAgentCode,
  removeAgentCodeFile,
  getAgentCodePath,
} from '../src/lib/agent-code.js';
import { createTestTeam } from './helpers.js';

function insertTypescriptAgent(teamId: string, id: string) {
  getDb().insert(agents).values({
    id, name: id, teamId, runtime: 'typescript', type: 'manual',
  }).run();
}

function insertExecAgent(teamId: string, id: string) {
  getDb().insert(agents).values({
    id, name: id, teamId, runtime: 'exec', command: 'echo', args: JSON.stringify(['hi']), type: 'manual',
  }).run();
}

describe('agent-code lib', () => {
  it('setAgentCode stores source, bundle, and hash on success', async () => {
    const team = createTestTeam('code-set');
    insertTypescriptAgent(team.id, 'code-set-a1');

    const result = await setAgentCode(team.id, 'code-set-a1', `console.log('hi');`);
    expect(result.ok).toBe(true);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);

    const row = getDb().select().from(agents).where(eq(agents.id, 'code-set-a1')).get();
    expect(row?.source).toContain('console.log');
    expect(row?.bundle).toBeTruthy();
    expect(row?.bundleHash).toBe(result.hash);
    expect(row?.bundleError).toBeNull();
  });

  it('setAgentCode stores bundleError and keeps source on bundle failure', async () => {
    const team = createTestTeam('code-bad');
    insertTypescriptAgent(team.id, 'code-bad-a1');

    const badSrc = `import x from 'nope-not-real-pkg'; console.log(x);`;
    const result = await setAgentCode(team.id, 'code-bad-a1', badSrc);
    expect(result.ok).toBe(false);

    const row = getDb().select().from(agents).where(eq(agents.id, 'code-bad-a1')).get();
    expect(row?.source).toBe(badSrc);           // source preserved for user to fix
    expect(row?.bundle).toBeNull();
    expect(row?.bundleHash).toBeNull();
    expect(row?.bundleError).toContain('nope-not-real-pkg');
  });

  it('setAgentCode rejects exec-runtime agents', async () => {
    const team = createTestTeam('code-exec');
    insertExecAgent(team.id, 'code-exec-a1');

    const result = await setAgentCode(team.id, 'code-exec-a1', `console.log('x');`);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/runtime/i);
  });

  it('setAgentCode rejects cross-team access', async () => {
    const teamA = createTestTeam('code-tA');
    const teamB = createTestTeam('code-tB');
    insertTypescriptAgent(teamA.id, 'code-cross-a1');

    const result = await setAgentCode(teamB.id, 'code-cross-a1', `console.log('x');`);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('getAgentCode returns source + hash + bundleError', async () => {
    const team = createTestTeam('code-get');
    insertTypescriptAgent(team.id, 'code-get-a1');
    await setAgentCode(team.id, 'code-get-a1', `console.log('go');`);

    const code = getAgentCode(team.id, 'code-get-a1');
    expect(code).not.toBeNull();
    expect(code!.source).toContain('console.log');
    expect(code!.bundleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(code!.bundleError).toBeNull();
  });

  it('getAgentCode returns null for exec runtime', async () => {
    const team = createTestTeam('code-get-exec');
    insertExecAgent(team.id, 'code-get-exec-a1');
    const code = getAgentCode(team.id, 'code-get-exec-a1');
    expect(code).toBeNull();
  });

  it('materializeAgentCode writes to dataDir and reuses when hash matches', async () => {
    const team = createTestTeam('code-mat');
    insertTypescriptAgent(team.id, 'code-mat-a1');
    await setAgentCode(team.id, 'code-mat-a1', `console.log('once');`);

    const path1 = materializeAgentCode('code-mat-a1');
    expect(existsSync(path1)).toBe(true);
    expect(path1).toBe(getAgentCodePath(team.id, 'code-mat-a1'));
    const contents1 = readFileSync(path1, 'utf8');
    expect(contents1).toContain('console.log');

    // Calling again with unchanged code should be a no-op (hash marker short-circuits)
    const path2 = materializeAgentCode('code-mat-a1');
    expect(path2).toBe(path1);

    // Changing the source should cause a rewrite
    await setAgentCode(team.id, 'code-mat-a1', `console.log('twice');`);
    materializeAgentCode('code-mat-a1');
    const contents3 = readFileSync(path1, 'utf8');
    expect(contents3).toContain('twice');
  });

  it('materializeAgentCode throws when no bundle exists', async () => {
    const team = createTestTeam('code-no-bundle');
    insertTypescriptAgent(team.id, 'code-no-bundle-a1');

    expect(() => materializeAgentCode('code-no-bundle-a1')).toThrow(/no bundled code/i);
  });

  it('removeAgentCodeFile deletes the materialized file', async () => {
    const team = createTestTeam('code-rm');
    insertTypescriptAgent(team.id, 'code-rm-a1');
    await setAgentCode(team.id, 'code-rm-a1', `console.log('temp');`);
    const path = materializeAgentCode('code-rm-a1');
    expect(existsSync(path)).toBe(true);

    removeAgentCodeFile(team.id, 'code-rm-a1');
    expect(existsSync(path)).toBe(false);
  });
});
