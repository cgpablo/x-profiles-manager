import {
  BackupExportOptions,
  BackupInspection,
  BackupRestoreResult,
  BrowserProfile,
  ProfileFolder,
} from '../types';
import { CoreDeps } from './ports';
import { baseName, extName, nameWithoutExt } from './paths';
import { ProfileService } from './profileService';
import { FolderService } from './folderService';
import { PasswordService } from './passwordService';
import { MailService } from './mailService';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

export class BackupService {
  constructor(
    private deps: CoreDeps,
    private profiles: ProfileService,
    private folders: FolderService,
    private passwords: PasswordService,
    private mails: MailService
  ) {}

  /**
   * Builds a ZIP containing:
   * - data.json: profiles, folders, passwords (encrypted), mails
   * - images/: all profile images as actual files
   * If profileIds is provided, only those profiles are exported, together with
   * their folders, images, and the passwords/mails linked to them.
   */
  async create(options: BackupExportOptions = {}): Promise<Uint8Array> {
    const { profileIds, includePasswords = true, includeMails = true, includeCharacterHub = true } = options;

    const selectedIds = profileIds ? new Set(profileIds) : null;
    const profiles = this.profiles
      .getAll()
      .filter((p) => !selectedIds || selectedIds.has(p.id))
      .map((p) => (includeCharacterHub ? p : { ...p, fcInfo: undefined }));
    const folderIds = new Set(profiles.map((p) => p.folderId).filter(Boolean));
    const folders = this.folders.getAll().filter((f) => !selectedIds || folderIds.has(f.id));
    const linkedToSelection = (entry: { profileIds?: string[] }) =>
      !selectedIds || (entry.profileIds || []).some((id) => selectedIds.has(id));
    const passwords = includePasswords ? this.passwords.getAllRaw().filter(linkedToSelection) : [];
    const mails = includeMails ? this.mails.getAll().filter(linkedToSelection) : [];

    const data = {
      version: 2,
      type: selectedIds ? 'partial' : 'full',
      exportedAt: new Date(this.deps.now()).toISOString(),
      profiles,
      folders,
      passwords,
      mails,
    };

    const entries: Array<{ name: string; data: Uint8Array }> = [
      { name: 'data.json', data: encoder.encode(JSON.stringify(data, null, 2)) },
    ];

    // Add all images: profile images + icon files (deduplicated)
    const addedFiles = new Set<string>();

    // Profile images (named by profileId for easy mapping on import)
    for (const profile of profiles) {
      if (!profile.imagePath) continue;
      const imageData = await this.deps.assets.readFile(profile.imagePath);
      if (!imageData) continue; // missing or unreadable
      const ext = extName(profile.imagePath) || '.png';
      entries.push({ name: `images/${profile.id}${ext}`, data: imageData });
      addedFiles.add(this.deps.assets.normalize(profile.imagePath));
    }

    // Remaining icon files from the icons store (skip already added)
    for (const icon of await this.deps.assets.listIcons()) {
      if (addedFiles.has(this.deps.assets.normalize(icon.path))) continue;
      const iconData = await this.deps.assets.readFile(icon.path);
      if (!iconData) continue;
      entries.push({ name: `images/${icon.name}`, data: iconData });
    }

    return this.deps.archive.create(entries);
  }

  private async readBackup(bytes: Uint8Array) {
    const zipEntries = await this.deps.archive.read(bytes);
    const dataEntry = zipEntries.find((e) => e.name === 'data.json');
    if (!dataEntry) {
      throw new Error('Invalid backup file: missing data.json');
    }
    const backup = JSON.parse(decoder.decode(dataEntry.data()));
    if (!backup.profiles || !backup.folders) {
      throw new Error('Invalid backup file: missing profiles or folders');
    }
    return { zipEntries, backup };
  }

  async inspect(bytes: Uint8Array): Promise<BackupInspection> {
    const { backup } = await this.readBackup(bytes);
    return {
      type: backup.type === 'partial' ? 'partial' : 'full',
      exportedAt: backup.exportedAt,
      profiles: backup.profiles.map((p: BrowserProfile) => ({ id: p.id, name: p.name, folderId: p.folderId })),
      folders: backup.folders,
      passwordCount: Array.isArray(backup.passwords) ? backup.passwords.length : 0,
      mailCount: Array.isArray(backup.mails) ? backup.mails.length : 0,
    };
  }

  /**
   * Imports app data from a ZIP backup, merging into existing data.
   * Profiles, passwords and mails that already exist are skipped.
   * - targetFolderId undefined: each profile keeps its original folder (missing folders are recreated)
   * - targetFolderId null: profiles go to Ungrouped
   * - targetFolderId string: all imported profiles go to that folder
   */
  async restore(bytes: Uint8Array, options: { targetFolderId?: string | null } = {}): Promise<BackupRestoreResult> {
    try {
      const { zipEntries, backup } = await this.readBackup(bytes);

      const existingProfiles = this.profiles.getAll();
      const existingProfileIds = new Set(existingProfiles.map((p) => p.id));
      const existingFolders = this.folders.getAll();
      const existingFolderIds = new Set(existingFolders.map((f) => f.id));

      const newProfiles: BrowserProfile[] = backup.profiles.filter((p: BrowserProfile) => !existingProfileIds.has(p.id));
      const newProfileIds = new Set(newProfiles.map((p) => p.id));
      const skippedProfileIds = new Set(
        backup.profiles.map((p: BrowserProfile) => p.id).filter((id: string) => !newProfileIds.has(id))
      );

      // Restore images of new profiles (skipped profiles keep their local image)
      const imageEntries = zipEntries.filter((e) => e.name.startsWith('images/') && !e.isDirectory);
      for (const entry of imageEntries) {
        const filename = baseName(entry.name);
        const nameNoExt = nameWithoutExt(filename);
        if (skippedProfileIds.has(nameNoExt)) continue;
        const destPath = await this.deps.assets.ensureIcon(filename, entry.data());
        const profile = newProfiles.find((p) => p.id === nameNoExt);
        if (profile) {
          profile.imagePath = destPath;
        }
      }

      // Assign folders
      const targetFolderId = options.targetFolderId;
      const foldersToAdd: ProfileFolder[] = [];
      for (const profile of newProfiles) {
        if (targetFolderId !== undefined) {
          if (targetFolderId) profile.folderId = targetFolderId;
          else delete profile.folderId;
          continue;
        }
        if (profile.folderId && !existingFolderIds.has(profile.folderId)) {
          const folder = (backup.folders as ProfileFolder[]).find((f) => f.id === profile.folderId);
          if (folder && !foldersToAdd.some((f) => f.id === folder.id)) {
            foldersToAdd.push(folder);
            existingFolderIds.add(folder.id);
          }
        }
      }

      if (newProfiles.length > 0) {
        this.profiles.saveAll([
          ...existingProfiles,
          ...newProfiles.map((p, i) => ({ ...p, orderIndex: existingProfiles.length + i })),
        ]);
      }

      if (foldersToAdd.length > 0) {
        this.folders.saveAll([
          ...existingFolders,
          ...foldersToAdd.map((f, i) => ({ ...f, order: existingFolders.length + i })),
        ]);
      }

      // Passwords and mails: skip entries whose name already exists
      const existingPasswords = this.passwords.getAllRaw();
      const passwordNames = new Set(existingPasswords.map((e) => e.name));
      const incomingPasswords: any[] = Array.isArray(backup.passwords) ? backup.passwords : [];
      const newPasswords = incomingPasswords.filter((e) => !passwordNames.has(e.name));
      if (newPasswords.length > 0) {
        this.passwords.restoreAll([...existingPasswords, ...newPasswords]);
      }

      const existingMails = this.mails.getAll();
      const mailNames = new Set(existingMails.map((e) => e.email));
      const incomingMails: any[] = Array.isArray(backup.mails) ? backup.mails : [];
      const newMails = incomingMails.filter((e) => !mailNames.has(e.email));
      if (newMails.length > 0) {
        this.mails.restoreAll([...existingMails, ...newMails]);
      }

      // Create profile data directories (empty, for the browser to initialize on first launch)
      for (const profile of newProfiles) {
        if (profile.dataDir && !this.deps.profileData.exists(profile.dataDir)) {
          this.deps.profileData.ensure(profile.dataDir);
        }
      }

      console.log('Backup restored successfully');
      return {
        profilesAdded: newProfiles.length,
        profilesSkipped: skippedProfileIds.size,
        foldersAdded: foldersToAdd.length,
        passwordsAdded: newPasswords.length,
        passwordsSkipped: incomingPasswords.length - newPasswords.length,
        mailsAdded: newMails.length,
        mailsSkipped: incomingMails.length - newMails.length,
      };
    } catch (error) {
      console.error('Error restoring backup:', error);
      throw error;
    }
  }
}
