/**
 * Storage Layer - Maneja persistencia local de perfiles y configuración
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { BrowserProfile, AppSettings, ProfileFolder, BackupExportOptions, BackupInspection, BackupRestoreResult } from '../types';
import { v4 as uuid } from 'uuid';

export class StorageManager {
  private appDataDir: string;
  private profilesFile: string;
  private settingsFile: string;
  private foldersFile: string;
  private iconsDir: string;

  constructor() {
    this.appDataDir = path.join(app.getPath('userData'), 'x-profiles-manager');
    this.profilesFile = path.join(this.appDataDir, 'profiles.json');
    this.settingsFile = path.join(this.appDataDir, 'settings.json');
    this.foldersFile = path.join(this.appDataDir, 'folders.json');
    this.iconsDir = path.join(this.appDataDir, 'icons');

    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.appDataDir)) {
      fs.mkdirSync(this.appDataDir, { recursive: true });
    }
    if (!fs.existsSync(this.iconsDir)) {
      fs.mkdirSync(this.iconsDir, { recursive: true });
    }
  }

  // ====== PROFILES ======

  getAllProfiles(): BrowserProfile[] {
    try {
      if (fs.existsSync(this.profilesFile)) {
        const data = fs.readFileSync(this.profilesFile, 'utf-8');
        const profiles: BrowserProfile[] = JSON.parse(data);

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
          this.saveProfiles(fixed);
        }

        // Sort by orderIndex so consumers always get profiles in saved order
        return [...fixed].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      }
      return [];
    } catch (error) {
      console.error('Error reading profiles:', error);
      return [];
    }
  }

  // Batch-save a new ordering without touching other profile fields
  saveProfilesOrder(profileIds: string[]): void {
    const raw = fs.existsSync(this.profilesFile)
      ? (JSON.parse(fs.readFileSync(this.profilesFile, 'utf-8')) as BrowserProfile[])
      : [];

    const indexMap = new Map(profileIds.map((id, i) => [id, i]));
    const updated = raw.map(p => ({
      ...p,
      orderIndex: indexMap.has(p.id) ? indexMap.get(p.id)! : (p.orderIndex ?? 999),
    }));
    this.saveProfiles(updated);
  }

  getProfile(profileId: string): BrowserProfile | null {
    const profiles = this.getAllProfiles();
    return profiles.find((p) => p.id === profileId) || null;
  }

  createProfile(
    name: string,
    color: string = '#3b82f6',
    icon: string = '🔗',
    xAccount?: string
  ): BrowserProfile {
    const profiles = this.getAllProfiles();
    const profilesBaseDir = this.getSettings().profilesDir;

    const profile: BrowserProfile = {
      id: uuid(),
      name,
      color,
      icon,
      xAccount,
      dataDir: path.join(profilesBaseDir, name.replace(/\s+/g, '_')),
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      isActive: false,
      orderIndex: profiles.length, // Assign order based on current count
    };

    profiles.push(profile);
    this.saveProfiles(profiles);

    // Create Chrome profile directory
    if (!fs.existsSync(profile.dataDir)) {
      fs.mkdirSync(profile.dataDir, { recursive: true });
    }

    return profile;
  }

  updateProfile(profileId: string, updates: Partial<BrowserProfile>): BrowserProfile | null {
    const profiles = this.getAllProfiles();
    const index = profiles.findIndex((p) => p.id === profileId);

    if (index === -1) return null;

    const current = profiles[index];

    // If name changed, rename the dataDir folder on disk and update the path
    if (updates.name && updates.name !== current.name) {
      const settings = this.getSettings();
      const newDirName = updates.name.replace(/\s+/g, '_');
      const newDataDir = path.join(settings.profilesDir, newDirName);

      if (newDataDir !== current.dataDir) {
        if (fs.existsSync(newDataDir)) {
          throw new Error(`A profile folder named "${newDirName}" already exists`);
        }
        if (fs.existsSync(current.dataDir)) {
          fs.renameSync(current.dataDir, newDataDir);
        }
        updates.dataDir = newDataDir;
      }
    }

    profiles[index] = { ...current, ...updates, lastAccessed: Date.now() };
    this.saveProfiles(profiles);
    return profiles[index];
  }

  deleteProfile(profileId: string): boolean {
    const profiles = this.getAllProfiles();
    const profile = profiles.find((p) => p.id === profileId);

    if (!profile) return false;

    // Remove from profiles list
    const filtered = profiles.filter((p) => p.id !== profileId);
    
    // Renormalize orderIndex after deletion
    const normalized = filtered.map((p, index) => ({
      ...p,
      orderIndex: index,
    }));
    
    this.saveProfiles(normalized);

    // Optional: Delete Chrome profile directory
    try {
      if (fs.existsSync(profile.dataDir)) {
        fs.rmSync(profile.dataDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error('Error deleting profile directory:', error);
    }

    return true;
  }

  private saveProfiles(profiles: BrowserProfile[]): void {
    fs.writeFileSync(this.profilesFile, JSON.stringify(profiles, null, 2));
  }

  // ====== FOLDERS ======

  getAllFolders(): ProfileFolder[] {
    try {
      if (fs.existsSync(this.foldersFile)) {
        const data = fs.readFileSync(this.foldersFile, 'utf-8');
        return JSON.parse(data).sort((a: ProfileFolder, b: ProfileFolder) => a.order - b.order);
      }
      return [];
    } catch (error) {
      console.error('Error reading folders:', error);
      return [];
    }
  }

  getFolder(folderId: string): ProfileFolder | null {
    const folders = this.getAllFolders();
    return folders.find((f) => f.id === folderId) || null;
  }

  createFolder(name: string, color: string, icon: string): ProfileFolder {
    const folders = this.getAllFolders();
    const folder: ProfileFolder = {
      id: uuid(),
      name,
      color,
      icon,
      createdAt: Date.now(),
      order: folders.length,
    };
    folders.push(folder);
    this.saveFolders(folders);
    return folder;
  }

  updateFolder(folderId: string, updates: Partial<ProfileFolder>): ProfileFolder {
    const folders = this.getAllFolders();
    const index = folders.findIndex((f) => f.id === folderId);
    if (index === -1) {
      throw new Error(`Folder ${folderId} not found`);
    }

    folders[index] = { ...folders[index], ...updates };
    this.saveFolders(folders);
    return folders[index];
  }

  deleteFolder(folderId: string): boolean {
    const folders = this.getAllFolders();
    const filtered = folders.filter((f) => f.id !== folderId);
    
    if (filtered.length === folders.length) return false;

    // Also remove folderId from any profiles
    const profiles = this.getAllProfiles();
    const updated = profiles.map((p) =>
      p.folderId === folderId ? { ...p, folderId: undefined } : p
    );
    this.saveProfiles(updated);

    // Reorder remaining folders
    filtered.forEach((f, index) => {
      f.order = index;
    });
    this.saveFolders(filtered);
    return true;
  }

  private saveFolders(folders: ProfileFolder[]): void {
    fs.writeFileSync(this.foldersFile, JSON.stringify(folders, null, 2));
  }

  // ====== SETTINGS ======

  getSettings(): AppSettings {
    try {
      if (fs.existsSync(this.settingsFile)) {
        const data = fs.readFileSync(this.settingsFile, 'utf-8');
        const saved = JSON.parse(data);
        // Merge with defaults so new fields are always present without overwriting saved values
        return { ...this.buildDefaultValues(), ...saved };
      }
      // File doesn't exist yet — create it with defaults
      return this.getDefaultSettings();
    } catch (error) {
      console.error('Error reading settings:', error);
      return this.buildDefaultValues();
    }
  }

  saveSettings(settings: AppSettings): void {
    fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2));
  }

  private buildDefaultValues(): AppSettings {
    // Try to detect Chrome path
    let chromePath = '';
    let geckoPath = '';

    if (process.platform === 'win32') {
      const chromePaths = [
        path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(
          process.env['ProgramFiles(x86)'] || '',
          'Google',
          'Chrome',
          'Application',
          'chrome.exe'
        ),
      ];
      chromePath = chromePaths.find((p) => fs.existsSync(p)) || '';

      const geckoPaths = [
        path.join(process.env.ProgramFiles || '', 'Mozilla Firefox', 'firefox.exe'),
        path.join(process.env['ProgramFiles(x86)'] || '', 'Mozilla Firefox', 'firefox.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Zen Browser', 'zen.exe'),
      ];
      geckoPath = geckoPaths.find((p) => fs.existsSync(p)) || '';
    } else if (process.platform === 'darwin') {
      const chromePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ];
      chromePath = chromePaths.find((p) => fs.existsSync(p)) || '';

      const geckoPaths = [
        '/Applications/Firefox.app/Contents/MacOS/firefox',
        '/Applications/Zen Browser.app/Contents/MacOS/zen',
        '/Applications/LibreWolf.app/Contents/MacOS/librewolf',
      ];
      geckoPath = geckoPaths.find((p) => fs.existsSync(p)) || '';
    } else {
      chromePath = '/usr/bin/google-chrome'; // Linux default
      const geckoPaths = [
        '/usr/bin/firefox',
        '/usr/bin/zen-browser',
        '/usr/bin/librewolf',
      ];
      geckoPath = geckoPaths.find((p) => fs.existsSync(p)) || '/usr/bin/firefox';
    }

    const profilesDir = path.join(this.appDataDir, '..', 'profiles');
    if (!fs.existsSync(profilesDir)) {
      fs.mkdirSync(profilesDir, { recursive: true });
    }

    return {
      browserEngine: 'chromium',
      chromePath,
      geckoPath,
      profilesDir,
      windowLayout: 'floating',
      autoLaunchOnStartup: false,
      backupIcons: false,
    };
  }

  private getDefaultSettings(): AppSettings {
    const defaults = this.buildDefaultValues();
    this.saveSettings(defaults);
    return defaults;
  }

  // ====== CLEAR ALL DATA ======

  clearAllData(): boolean {
    try {
      // Delete all JSON files
      if (fs.existsSync(this.profilesFile)) {
        fs.unlinkSync(this.profilesFile);
      }
      if (fs.existsSync(this.foldersFile)) {
        fs.unlinkSync(this.foldersFile);
      }
      if (fs.existsSync(this.settingsFile)) {
        fs.unlinkSync(this.settingsFile);
      }

      // Re-initialize with default settings
      this.getDefaultSettings();

      return true;
    } catch (error) {
      console.error('Error clearing data:', error);
      return false;
    }
  }

  // ====== ICONS ======

  backupIcon(originalPath: string): string {
    const ext = path.extname(originalPath);
    const destPath = path.join(this.iconsDir, `${uuid()}${ext}`);
    fs.copyFileSync(originalPath, destPath);
    return destPath;
  }

  deleteAllBackedUpIcons(): void {
    if (fs.existsSync(this.iconsDir)) {
      const files = fs.readdirSync(this.iconsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.iconsDir, file));
      }
    }
  }

  // ====== BACKUP/RESTORE ======

  /**
   * Exports all app data as a ZIP containing:
   * - data.json: profiles, folders, passwords (encrypted), mails
   * - images/: all profile images as actual files
   * If profileIds is provided, only those profiles are exported, together with
   * their folders, images, and the passwords/mails linked to them.
   */
  async createBackup(outputPath: string, options: BackupExportOptions = {}): Promise<string> {
    const AdmZip = require('adm-zip');
    const { passwordManager } = require('./passwordManager');
    const { mailManager } = require('./mailManager');
    const { profileIds, includePasswords = true, includeMails = true, includeCharacterHub = true } = options;

    try {
      if (!outputPath || typeof outputPath !== 'string') {
        throw new Error('Invalid output path for backup');
      }

      const zip = new AdmZip();

      // Gather all metadata
      const selectedIds = profileIds ? new Set(profileIds) : null;
      const profiles = this.getAllProfiles()
        .filter(p => !selectedIds || selectedIds.has(p.id))
        .map(p => (includeCharacterHub ? p : { ...p, fcInfo: undefined }));
      const folderIds = new Set(profiles.map(p => p.folderId).filter(Boolean));
      const folders = this.getAllFolders().filter(f => !selectedIds || folderIds.has(f.id));
      const linkedToSelection = (entry: { profileIds?: string[] }) =>
        !selectedIds || (entry.profileIds || []).some(id => selectedIds.has(id));
      const passwords = includePasswords ? passwordManager.getAllRaw().filter(linkedToSelection) : [];
      const mails = includeMails ? mailManager.getAll().filter(linkedToSelection) : [];

      const data = {
        version: 2,
        type: selectedIds ? 'partial' : 'full',
        exportedAt: new Date().toISOString(),
        profiles,
        folders,
        passwords,
        mails,
      };

      zip.addFile('data.json', Buffer.from(JSON.stringify(data, null, 2)));

      // Add all images: profile images + icon files (deduplicated)
      const addedFiles = new Set<string>();

      // Add profile images (named by profileId for easy mapping on import)
      for (const profile of profiles) {
        if (profile.imagePath && fs.existsSync(profile.imagePath)) {
          try {
            const ext = path.extname(profile.imagePath) || '.png';
            const imageData = fs.readFileSync(profile.imagePath);
            const zipName = `images/${profile.id}${ext}`;
            zip.addFile(zipName, imageData);
            addedFiles.add(path.resolve(profile.imagePath));
          } catch {
            // Skip unreadable images
          }
        }
      }

      // Add remaining icon files from iconsDir (skip already added)
      if (fs.existsSync(this.iconsDir)) {
        for (const file of fs.readdirSync(this.iconsDir)) {
          const filePath = path.join(this.iconsDir, file);
          if (addedFiles.has(path.resolve(filePath))) continue;
          try {
            if (fs.statSync(filePath).isFile()) {
              zip.addFile(`images/${file}`, fs.readFileSync(filePath));
            }
          } catch {
            // Skip unreadable files
          }
        }
      }

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      zip.writeZip(outputPath);
      console.log(`Backup exported to: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('Error creating backup:', error);
      throw error;
    }
  }

  /**
   * Imports app data from a ZIP backup file.
   * Restores: profiles, folders, passwords (encrypted), mails, and profile images.
   */
  inspectBackup(backupPath: string): BackupInspection {
    const AdmZip = require('adm-zip');
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found');
    }
    const zip = new AdmZip(backupPath);
    const dataEntry = zip.getEntries().find((e: any) => e.entryName === 'data.json');
    if (!dataEntry) {
      throw new Error('Invalid backup file: missing data.json');
    }
    const backup = JSON.parse(dataEntry.getData().toString('utf-8'));
    if (!backup.profiles || !backup.folders) {
      throw new Error('Invalid backup file: missing profiles or folders');
    }
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
   * Imports app data from a ZIP backup file, merging into existing data.
   * Profiles, passwords and mails that already exist are skipped.
   * - targetFolderId undefined: each profile keeps its original folder (missing folders are recreated)
   * - targetFolderId null: profiles go to Ungrouped
   * - targetFolderId string: all imported profiles go to that folder
   */
  async restoreBackup(backupPath: string, options: { targetFolderId?: string | null } = {}): Promise<BackupRestoreResult> {
    const AdmZip = require('adm-zip');
    const { passwordManager } = require('./passwordManager');
    const { mailManager } = require('./mailManager');

    try {
      if (!fs.existsSync(backupPath)) {
        throw new Error('Backup file not found');
      }

      const zip = new AdmZip(backupPath);
      const zipEntries = zip.getEntries();

      const dataEntry = zipEntries.find((e: any) => e.entryName === 'data.json');
      if (!dataEntry) {
        throw new Error('Invalid backup file: missing data.json');
      }

      const backup = JSON.parse(dataEntry.getData().toString('utf-8'));

      if (!backup.profiles || !backup.folders) {
        throw new Error('Invalid backup file: missing profiles or folders');
      }

      const existingProfiles = this.getAllProfiles();
      const existingProfileIds = new Set(existingProfiles.map(p => p.id));
      const existingFolders = this.getAllFolders();
      const existingFolderIds = new Set(existingFolders.map(f => f.id));

      const newProfiles: BrowserProfile[] = backup.profiles.filter((p: BrowserProfile) => !existingProfileIds.has(p.id));
      const newProfileIds = new Set(newProfiles.map(p => p.id));
      const skippedProfileIds = new Set(backup.profiles.map((p: BrowserProfile) => p.id).filter((id: string) => !newProfileIds.has(id)));

      // Restore images of new profiles (skipped profiles keep their local image)
      const imageEntries = zipEntries.filter((e: any) => e.entryName.startsWith('images/') && !e.isDirectory);
      for (const entry of imageEntries) {
        const filename = path.basename(entry.entryName);
        const nameWithoutExt = path.parse(filename).name;
        if (skippedProfileIds.has(nameWithoutExt)) continue;
        const destPath = path.join(this.iconsDir, filename);
        if (!fs.existsSync(destPath)) {
          fs.writeFileSync(destPath, entry.getData());
        }
        const profile = newProfiles.find(p => p.id === nameWithoutExt);
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
          const folder = (backup.folders as ProfileFolder[]).find(f => f.id === profile.folderId);
          if (folder && !foldersToAdd.some(f => f.id === folder.id)) {
            foldersToAdd.push(folder);
            existingFolderIds.add(folder.id);
          }
        }
      }

      if (newProfiles.length > 0) {
        const merged = [
          ...existingProfiles,
          ...newProfiles.map((p, i) => ({ ...p, orderIndex: existingProfiles.length + i })),
        ];
        this.saveProfiles(merged);
      }

      if (foldersToAdd.length > 0) {
        this.saveFolders([
          ...existingFolders,
          ...foldersToAdd.map((f, i) => ({ ...f, order: existingFolders.length + i })),
        ]);
      }

      // Passwords and mails: skip entries whose name already exists
      const existingPasswords = passwordManager.getAllRaw();
      const passwordNames = new Set(existingPasswords.map((e: any) => e.name));
      const incomingPasswords: any[] = Array.isArray(backup.passwords) ? backup.passwords : [];
      const newPasswords = incomingPasswords.filter(e => !passwordNames.has(e.name));
      if (newPasswords.length > 0) {
        passwordManager.restoreAll([...existingPasswords, ...newPasswords]);
      }

      const existingMails = mailManager.getAll();
      const mailNames = new Set(existingMails.map((e: any) => e.email));
      const incomingMails: any[] = Array.isArray(backup.mails) ? backup.mails : [];
      const newMails = incomingMails.filter(e => !mailNames.has(e.email));
      if (newMails.length > 0) {
        mailManager.restoreAll([...existingMails, ...newMails]);
      }

      // Create profile data directories (empty, for the browser to initialize on first launch)
      for (const profile of newProfiles) {
        if (profile.dataDir && !fs.existsSync(profile.dataDir)) {
          fs.mkdirSync(profile.dataDir, { recursive: true });
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


  private async removeDirectoryWithRetry(dirPath: string, maxRetries: number = 3, delayMs: number = 500): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
        return;
      } catch (error: any) {
        console.log(`Remove directory attempt ${i + 1}/${maxRetries} failed for ${dirPath}:`, error.code);
        
        // On Windows, if we get EPERM, try to kill Chrome processes
        if (process.platform === 'win32' && (error.code === 'EPERM' || error.code === 'EACCES')) {
          if (i < maxRetries - 1) {
            console.log('Attempting to kill Chrome processes on Windows...');
            try {
              const { execSync } = require('child_process');
              // Kill all chrome processes
              execSync('taskkill /F /IM chrome.exe', { stdio: 'ignore', shell: true });
              console.log('Chrome processes terminated');
            } catch (e) {
              // Ignore if chrome.exe not found
            }
          }
        }
        
        if (i === maxRetries - 1) {
          throw error; // Throw on last retry
        }
        
        // Wait before retrying with exponential backoff (Windows file locks may release)
        const waitTime = delayMs * Math.pow(2, i);
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
}

export const storageManager = new StorageManager();
