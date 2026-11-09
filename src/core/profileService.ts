import { BrowserProfile } from '../types';
import { CoreDeps } from './ports';
import { SettingsService } from './settingsService';

export class ProfileService {
  constructor(private deps: CoreDeps, private settings: SettingsService) {}

  getAll(): BrowserProfile[] {
    try {
      const profiles = this.deps.documents.read<BrowserProfile[]>('profiles');
      if (profiles === undefined) return [];

      // Only fix profiles that are completely missing orderIndex (first-time migration)
      // Do NOT renormalize existing indices — that would destroy saved order
      let needsSave = false;
      const fixed = profiles.map((p, index) => {
        if (p.orderIndex === undefined || p.orderIndex === null) {
          needsSave = true;
          return { ...p, orderIndex: index };
        }
        return p;
      });

      if (needsSave) {
        this.saveAll(fixed);
      }

      // Sort by orderIndex so consumers always get profiles in saved order
      return [...fixed].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    } catch (error) {
      console.error('Error reading profiles:', error);
      return [];
    }
  }

  /** Batch-save a new ordering without touching other profile fields. */
  saveOrder(profileIds: string[]): void {
    const raw = this.deps.documents.read<BrowserProfile[]>('profiles') ?? [];

    const indexMap = new Map(profileIds.map((id, i) => [id, i]));
    const updated = raw.map((p) => ({
      ...p,
      orderIndex: indexMap.has(p.id) ? indexMap.get(p.id)! : (p.orderIndex ?? 999),
    }));
    this.saveAll(updated);
  }

  get(profileId: string): BrowserProfile | null {
    return this.getAll().find((p) => p.id === profileId) || null;
  }

  create(
    name: string,
    color: string = '#3b82f6',
    icon: string = '🔗',
    xAccount?: string
  ): BrowserProfile {
    const profiles = this.getAll();
    const profilesBaseDir = this.settings.get().profilesDir;

    const profile: BrowserProfile = {
      id: this.deps.newId(),
      name,
      color,
      icon,
      xAccount,
      dataDir: this.deps.profileData.dataDirFor(profilesBaseDir, name),
      createdAt: this.deps.now(),
      lastAccessed: this.deps.now(),
      isActive: false,
      orderIndex: profiles.length, // Assign order based on current count
    };

    profiles.push(profile);
    this.saveAll(profiles);

    // Create the browser profile directory
    if (!this.deps.profileData.exists(profile.dataDir)) {
      this.deps.profileData.ensure(profile.dataDir);
    }

    return profile;
  }

  update(profileId: string, updates: Partial<BrowserProfile>): BrowserProfile | null {
    const profiles = this.getAll();
    const index = profiles.findIndex((p) => p.id === profileId);

    if (index === -1) return null;

    const current = profiles[index];

    // If name changed, rename the dataDir folder on disk and update the path
    if (updates.name && updates.name !== current.name) {
      const settings = this.settings.get();
      const newDataDir = this.deps.profileData.dataDirFor(settings.profilesDir, updates.name);

      if (newDataDir !== current.dataDir) {
        if (this.deps.profileData.exists(newDataDir)) {
          throw new Error(`A profile folder named "${updates.name.replace(/\s+/g, '_')}" already exists`);
        }
        if (this.deps.profileData.exists(current.dataDir)) {
          this.deps.profileData.rename(current.dataDir, newDataDir);
        }
        updates.dataDir = newDataDir;
      }
    }

    profiles[index] = { ...current, ...updates, lastAccessed: this.deps.now() };
    this.saveAll(profiles);
    return profiles[index];
  }

  delete(profileId: string): boolean {
    const profiles = this.getAll();
    const profile = profiles.find((p) => p.id === profileId);

    if (!profile) return false;

    const filtered = profiles.filter((p) => p.id !== profileId);

    // Renormalize orderIndex after deletion
    const normalized = filtered.map((p, index) => ({
      ...p,
      orderIndex: index,
    }));

    this.saveAll(normalized);

    // Optional: delete the browser profile directory
    try {
      if (this.deps.profileData.exists(profile.dataDir)) {
        this.deps.profileData.remove(profile.dataDir);
      }
    } catch (error) {
      console.error('Error deleting profile directory:', error);
    }

    return true;
  }

  saveAll(profiles: BrowserProfile[]): void {
    this.deps.documents.write('profiles', profiles);
  }
}
