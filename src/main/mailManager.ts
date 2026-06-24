/**
 * MailManager - Plain JSON email storage (no encryption)
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { MailEntry } from '../types';

function getStoragePath(): string {
  return path.join(app.getPath('userData'), 'mails.json');
}

function readAll(): MailEntry[] {
  const p = getStoragePath();
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as MailEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: MailEntry[]): void {
  fs.writeFileSync(getStoragePath(), JSON.stringify(entries, null, 2), 'utf-8');
}

export const mailManager = {
  getAll(): MailEntry[] {
    return readAll();
  },

  create(email: string, profileIds: string[]): MailEntry {
    const entries = readAll();
    const entry: MailEntry = {
      id: crypto.randomUUID(),
      email,
      profileIds,
      createdAt: Date.now(),
    };
    entries.push(entry);
    writeAll(entries);
    return entry;
  },

  update(
    id: string,
    updates: { email?: string; profileIds?: string[] }
  ): MailEntry | null {
    const entries = readAll();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    if (updates.email !== undefined) entries[idx].email = updates.email;
    if (updates.profileIds !== undefined) entries[idx].profileIds = updates.profileIds;
    entries[idx].updatedAt = Date.now();
    writeAll(entries);
    return entries[idx];
  },

  delete(id: string): boolean {
    const entries = readAll();
    const filtered = entries.filter((e) => e.id !== id);
    if (filtered.length === entries.length) return false;
    writeAll(filtered);
    return true;
  },
};
