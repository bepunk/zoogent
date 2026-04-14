import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { settings } from '../db/schema.js';
import { encryptEnv, decryptEnv, loadMasterKey } from './crypto.js';

function getMasterKey(): Buffer {
  return loadMasterKey(process.env.DATA_DIR || './data');
}

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return null;

  if (row.encrypted) {
    try {
      const decrypted = decryptEnv(row.value, getMasterKey());
      return decrypted._value ?? null;
    } catch {
      return null;
    }
  }
  return row.value;
}

export function setSetting(key: string, value: string, encrypt = false): void {
  const db = getDb();
  const now = new Date();

  let storedValue = value;
  if (encrypt) {
    storedValue = encryptEnv({ _value: value }, getMasterKey());
  }

  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) {
    db.update(settings).set({ value: storedValue, encrypted: encrypt, updatedAt: now }).where(eq(settings.key, key)).run();
  } else {
    db.insert(settings).values({ key, value: storedValue, encrypted: encrypt, updatedAt: now }).run();
  }
}

export function deleteSetting(key: string): void {
  const db = getDb();
  db.delete(settings).where(eq(settings.key, key)).run();
}

export function getAllSettings(): { key: string; encrypted: boolean; updatedAt: Date | null }[] {
  const db = getDb();
  return db.select({ key: settings.key, encrypted: settings.encrypted, updatedAt: settings.updatedAt }).from(settings).all();
}
