import { closeDb, getDb, runMigrations, initFts } from '../src/db/index.js';
import { seedSystemSkills } from '../src/db/seed-skills.js';
import { apiKeys } from '../src/db/schema.js';
import { randomBytes } from 'node:crypto';
import { unlinkSync, mkdirSync, rmSync } from 'node:fs';

const testId = randomBytes(4).toString('hex');
const dbPath = `/tmp/zoogent-test-${testId}.db`;
const dataDir = `/tmp/zoogent-test-data-${testId}`;

export const TEST_API_KEY = 'zg_test-key-for-testing';

beforeAll(() => {
  process.env.DATABASE_URL = dbPath;
  process.env.DATA_DIR = dataDir;
  process.env.PORT = '0';
  mkdirSync(`${dataDir}/secrets`, { recursive: true });
  closeDb();
  const db = getDb();
  runMigrations();
  initFts();
  seedSystemSkills();
  // Create test API key in DB (auth checks api_keys table)
  db.insert(apiKeys).values({ id: 'test-key-id', name: 'Test', key: TEST_API_KEY }).run();
});

afterAll(() => {
  closeDb();
  try { unlinkSync(dbPath); } catch {}
  try { unlinkSync(`${dbPath}-wal`); } catch {}
  try { unlinkSync(`${dbPath}-shm`); } catch {}
  try { rmSync(dataDir, { recursive: true }); } catch {}
});
