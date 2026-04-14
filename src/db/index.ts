import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _db: ReturnType<typeof drizzle> | null = null;
let _sqlite: Database.Database | null = null;

export function getDb() {
  if (_db) return _db;

  const dbPath = process.env.DATABASE_URL || './data/zoogent.db';

  // Ensure data directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const isNew = !existsSync(dbPath);

  _sqlite = new Database(dbPath);

  // Set file permissions on new DB
  if (isNew) {
    try {
      chmodSync(dbPath, 0o600);
    } catch {
      // May fail on some OS/filesystems, non-critical
    }
  }

  // Performance & safety PRAGMAs
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('synchronous = NORMAL');
  _sqlite.pragma('cache_size = -8000'); // 8MB
  _sqlite.pragma('busy_timeout = 5000'); // 5s wait on lock
  _sqlite.pragma('foreign_keys = ON');

  _db = drizzle(_sqlite, { schema });

  return _db;
}

/**
 * Run pending migrations. Safe to call multiple times.
 * Migrations folder is relative to package root (drizzle/).
 */
export function runMigrations() {
  const db = getDb();
  const migrationsFolder = resolve(__dirname, '../../drizzle');
  if (!existsSync(migrationsFolder)) {
    console.warn('[db] Migrations folder not found:', migrationsFolder);
    return;
  }
  migrate(db, { migrationsFolder });
}

export function getSqlite(): Database.Database {
  if (!_sqlite) getDb();
  return _sqlite!;
}

/**
 * Initialize FTS5 virtual table for memory search.
 * Must be called after drizzle-kit push creates the base tables.
 */
export function initFts() {
  const sqlite = getSqlite();

  // Create FTS5 table if it doesn't exist
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS agent_memories_fts
    USING fts5(content, agent_id UNINDEXED, tokenize='porter unicode61');
  `);

  // Create triggers to keep FTS in sync
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS agent_memories_ai AFTER INSERT ON agent_memories BEGIN
      INSERT INTO agent_memories_fts(rowid, content, agent_id)
      VALUES (new.id, new.content, new.agent_id);
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS agent_memories_ad AFTER DELETE ON agent_memories BEGIN
      DELETE FROM agent_memories_fts WHERE rowid = old.id;
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS agent_memories_au AFTER UPDATE ON agent_memories BEGIN
      DELETE FROM agent_memories_fts WHERE rowid = old.id;
      INSERT INTO agent_memories_fts(rowid, content, agent_id)
      VALUES (new.id, new.content, new.agent_id);
    END;
  `);
}

export function closeDb() {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}
