/**
 * Storage Layer - Maneja persistencia local de perfiles y configuración
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { BrowserProfile, AppSettings, ProfileFolder } from '../types';
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
   */
  async createBackup(outputPath: string): Promise<string> {
    const AdmZip = require('adm-zip');
    const { passwordManager } = require('./passwordManager');
    const { mailManager } = require('./mailManager');

    try {
      if (!outputPath || typeof outputPath !== 'string') {
        throw new Error('Invalid output path for backup');
      }

      const zip = new AdmZip();

      // Gather all metadata
      const profiles = this.getAllProfiles();
      const folders = this.getAllFolders();
      const passwords = passwordManager.getAllRaw();
      const mails = mailManager.getAll();

      const data = {
        version: 2,
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
  async restoreBackup(backupPath: string): Promise<void> {
    const AdmZip = require('adm-zip');
    const { passwordManager } = require('./passwordManager');
    const { mailManager } = require('./mailManager');

    try {
      if (!fs.existsSync(backupPath)) {
        throw new Error('Backup file not found');
      }

      const zip = new AdmZip(backupPath);
      const zipEntries = zip.getEntries();

      // Read data.json
      const dataEntry = zipEntries.find((e: any) => e.entryName === 'data.json');
      if (!dataEntry) {
        throw new Error('Invalid backup file: missing data.json');
      }

      const backup = JSON.parse(dataEntry.getData().toString('utf-8'));

      if (!backup.profiles || !backup.folders) {
        throw new Error('Invalid backup file: missing profiles or folders');
      }

      // Restore images first (so we can update imagePaths before saving profiles)
      const imageEntries = zipEntries.filter((e: any) => e.entryName.startsWith('images/') && !e.isDirectory);
      for (const entry of imageEntries) {
        const filename = path.basename(entry.entryName);
        const destPath = path.join(this.iconsDir, filename);
        fs.writeFileSync(destPath, entry.getData());

        // If filename matches a profileId (e.g. "uuid.png"), update that profile's imagePath
        const nameWithoutExt = path.parse(filename).name;
        const profile = backup.profiles.find((p: any) => p.id === nameWithoutExt);
        if (profile) {
          profile.imagePath = destPath;
        }
      }

      // Restore profiles (with updated imagePaths)
      this.saveProfiles(backup.profiles);

      // Restore folders
      this.saveFolders(backup.folders);

      // Restore passwords (if present)
      if (backup.passwords && Array.isArray(backup.passwords)) {
        passwordManager.restoreAll(backup.passwords);
      }

      // Restore mails (if present)
      if (backup.mails && Array.isArray(backup.mails)) {
        mailManager.restoreAll(backup.mails);
      }

      // Create profile data directories (empty, for the browser to initialize on first launch)
      for (const profile of backup.profiles) {
        if (profile.dataDir && !fs.existsSync(profile.dataDir)) {
          fs.mkdirSync(profile.dataDir, { recursive: true });
        }
      }

      console.log('Backup restored successfully');
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
