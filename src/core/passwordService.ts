import { PasswordEntry } from '../types';
import { CoreDeps } from './ports';

export type PasswordSummary = Omit<PasswordEntry, 'encryptedValue'>;

export class PasswordService {
  constructor(private deps: CoreDeps) {}

  private readAll(): PasswordEntry[] {
    try {
      return this.deps.documents.read<PasswordEntry[]>('passwords') ?? [];
    } catch {
      return [];
    }
  }

  private writeAll(entries: PasswordEntry[]): void {
    this.deps.documents.write('passwords', entries);
  }

  /** Return all entries WITHOUT encryptedValue */
  getAll(): PasswordSummary[] {
    return this.readAll().map(({ encryptedValue: _ev, ...rest }) => rest);
  }

  create(name: string, value: string, profileIds: string[]): PasswordSummary {
    const entries = this.readAll();
    const entry: PasswordEntry = {
      id: this.deps.newId(),
      name,
      encryptedValue: this.deps.cipher.encrypt(value),
      profileIds,
      createdAt: this.deps.now(),
    };
    entries.push(entry);
    this.writeAll(entries);
    const { encryptedValue: _ev, ...rest } = entry;
    return rest;
  }

  update(
    id: string,
    updates: { name?: string; value?: string; profileIds?: string[] }
  ): PasswordSummary | null {
    const entries = this.readAll();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    if (updates.name !== undefined) entries[idx].name = updates.name;
    if (updates.value !== undefined) entries[idx].encryptedValue = this.deps.cipher.encrypt(updates.value);
    if (updates.profileIds !== undefined) entries[idx].profileIds = updates.profileIds;
    entries[idx].updatedAt = this.deps.now();
    this.writeAll(entries);
    const { encryptedValue: _ev, ...rest } = entries[idx];
    return rest;
  }

  delete(id: string): boolean {
    const entries = this.readAll();
    const filtered = entries.filter((e) => e.id !== id);
    if (filtered.length === entries.length) return false;
    this.writeAll(filtered);
    return true;
  }

  /** Return the plaintext password for the first entry linked to profileId, or null */
  getDecryptedForProfile(profileId: string): string | null {
    const entry = this.readAll().find((e) => e.profileIds.includes(profileId));
    if (!entry) return null;
    try {
      return this.deps.cipher.decrypt(entry.encryptedValue);
    } catch {
      return null;
    }
  }

  /** Return the plaintext value for a specific entry by id, or null */
  getDecryptedById(id: string): string | null {
    const entry = this.readAll().find((e) => e.id === id);
    if (!entry) return null;
    try {
      return this.deps.cipher.decrypt(entry.encryptedValue);
    } catch {
      return null;
    }
  }

  /** Return all entries WITH encryptedValue (for backup) */
  getAllRaw(): PasswordEntry[] {
    return this.readAll();
  }

  /** Overwrite all entries (for restore) */
  restoreAll(entries: PasswordEntry[]): void {
    this.writeAll(entries);
  }
}
