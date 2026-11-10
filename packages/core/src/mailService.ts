import { MailEntry } from './types';
import { CoreDeps } from './ports';

export class MailService {
  constructor(private deps: CoreDeps) {}

  private readAll(): MailEntry[] {
    try {
      return this.deps.documents.read<MailEntry[]>('mails') ?? [];
    } catch {
      return [];
    }
  }

  private writeAll(entries: MailEntry[]): void {
    this.deps.documents.write('mails', entries);
  }

  getAll(): MailEntry[] {
    return this.readAll();
  }

  create(email: string, profileIds: string[]): MailEntry {
    const entries = this.readAll();
    const entry: MailEntry = {
      id: this.deps.newId(),
      email,
      profileIds,
      createdAt: this.deps.now(),
    };
    entries.push(entry);
    this.writeAll(entries);
    return entry;
  }

  update(id: string, updates: { email?: string; profileIds?: string[] }): MailEntry | null {
    const entries = this.readAll();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    if (updates.email !== undefined) entries[idx].email = updates.email;
    if (updates.profileIds !== undefined) entries[idx].profileIds = updates.profileIds;
    entries[idx].updatedAt = this.deps.now();
    this.writeAll(entries);
    return entries[idx];
  }

  delete(id: string): boolean {
    const entries = this.readAll();
    const filtered = entries.filter((e) => e.id !== id);
    if (filtered.length === entries.length) return false;
    this.writeAll(filtered);
    return true;
  }

  /** Overwrite all entries (for restore) */
  restoreAll(entries: MailEntry[]): void {
    this.writeAll(entries);
  }
}
