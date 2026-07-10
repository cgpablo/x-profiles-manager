/**
 * PasswordManager - AES-256-CBC encrypted password storage
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { PasswordEntry } from '../types';

const ALGORITHM = 'aes-256-cbc';
// Derive a 32-byte key once at module load
const KEY = crypto.scryptSync('x-profiles-manager-pw-v1', 'xpm-pw-salt-static', 32);

function getStoragePath(): string {
  return path.join(app.getPath('userData'), 'passwords.json');
}

function readAll(): PasswordEntry[] {
  const p = getStoragePath();
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as PasswordEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: PasswordEntry[]): void {
  fs.writeFileSync(getStoragePath(), JSON.stringify(entries, null, 2), 'utf-8');
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(stored: string): string {
  const [ivHex, dataHex] = stored.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf-8');
}

export const passwordManager = {
  /** Return all entries WITHOUT encryptedValue */
  getAll(): Omit<PasswordEntry, 'encryptedValue'>[] {
    return readAll().map(({ encryptedValue: _ev, ...rest }) => rest);
  },

  create(
    name: string,
    value: string,
    profileIds: string[]
  ): Omit<PasswordEntry, 'encryptedValue'> {
    const entries = readAll();
    const entry: PasswordEntry = {
      id: crypto.randomUUID(),
      name,
      encryptedValue: encrypt(value),
      profileIds,
      createdAt: Date.now(),
    };
    entries.push(entry);
    writeAll(entries);
    const { encryptedValue: _ev, ...rest } = entry;
    return rest;
  },

  update(
    id: string,
    updates: { name?: string; value?: string; profileIds?: string[] }
  ): Omit<PasswordEntry, 'encryptedValue'> | null {
    const entries = readAll();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    if (updates.name !== undefined) entries[idx].name = updates.name;
    if (updates.value !== undefined) entries[idx].encryptedValue = encrypt(updates.value);
    if (updates.profileIds !== undefined) entries[idx].profileIds = updates.profileIds;
    entries[idx].updatedAt = Date.now();
    writeAll(entries);
    const { encryptedValue: _ev, ...rest } = entries[idx];
    return rest;
  },

  delete(id: string): boolean {
    const entries = readAll();
    const filtered = entries.filter((e) => e.id !== id);
    if (filtered.length === entries.length) return false;
    writeAll(filtered);
    return true;
  },

  /** Return the plaintext password for the first entry linked to profileId, or null */
  getDecryptedForProfile(profileId: string): string | null {
    const entries = readAll();
    const entry = entries.find((e) => e.profileIds.includes(profileId));
    if (!entry) return null;
    try {
      return decrypt(entry.encryptedValue);
    } catch {
      return null;
    }
  },

  /** Return all entries WITH encryptedValue (for backup) */
  getAllRaw(): PasswordEntry[] {
    return readAll();
  },

  /** Overwrite all entries (for restore) */
  restoreAll(entries: PasswordEntry[]): void {
    writeAll(entries);
  },
};
