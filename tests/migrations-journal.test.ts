import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const migrationsDir = resolve(__dirname, '../drizzle');

describe('drizzle migrations journal', () => {
  it('entries are sorted by timestamp ascending', () => {
    // Drizzle's SQLite migrator skips any migration whose `when` is <= the last
    // applied migration's timestamp. An out-of-order entry silently breaks upgrades
    // on existing databases (fresh DBs would still work). Enforce ascending order.
    const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta/_journal.json'), 'utf8'));
    const entries: Array<{ tag: string; when: number }> = journal.entries;
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1];
      const curr = entries[i];
      expect(curr.when, `${curr.tag} must have when > ${prev.tag}`).toBeGreaterThan(prev.when);
    }
  });

  it('all migrations apply to an existing DB previously migrated without the latest entry', () => {
    // Simulate the real upgrade path: a DB that already ran migrations up to N-1,
    // then gets a package with N migrations. The last one must apply.
    const journalPath = join(migrationsDir, 'meta/_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    expect(journal.entries.length).toBeGreaterThan(1);

    const tmpDir = mkdtempSync(join(tmpdir(), 'zoogent-mig-'));
    const tmpMigDir = join(tmpDir, 'drizzle');
    mkdirSync(join(tmpMigDir, 'meta'), { recursive: true });
    for (const f of readdirSync(migrationsDir)) {
      if (f === 'meta') continue;
      copyFileSync(join(migrationsDir, f), join(tmpMigDir, f));
    }

    // Step 1: migrate with journal minus last entry (simulate older package)
    const partialJournal = { ...journal, entries: journal.entries.slice(0, -1) };
    writeFileSync(join(tmpMigDir, 'meta/_journal.json'), JSON.stringify(partialJournal));

    const dbPath = join(tmpDir, 'test.db');
    let sqlite = new Database(dbPath);
    let db = drizzle(sqlite);
    migrate(db, { migrationsFolder: tmpMigDir });
    const beforeCount = (sqlite.prepare('SELECT COUNT(*) as n FROM __drizzle_migrations').get() as any).n;
    expect(beforeCount).toBe(journal.entries.length - 1);
    sqlite.close();

    // Step 2: write full journal (simulate package upgrade) and re-migrate
    writeFileSync(join(tmpMigDir, 'meta/_journal.json'), JSON.stringify(journal));
    sqlite = new Database(dbPath);
    db = drizzle(sqlite);
    migrate(db, { migrationsFolder: tmpMigDir });
    const afterCount = (sqlite.prepare('SELECT COUNT(*) as n FROM __drizzle_migrations').get() as any).n;
    expect(afterCount, 'last migration must apply on upgrade').toBe(journal.entries.length);
    sqlite.close();

    try { unlinkSync(dbPath); } catch {}
  });
});
