/**
 * Storage Layer - Maneja persistencia local de perfiles y configuración
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { ChromeProfile, AppSettings, ProfileFolder } from '../types';
import { v4 as uuid } from 'uuid';

export class StorageManager {
  private appDataDir: string;
  private profilesFile: string;
  private settingsFile: string;
  private foldersFile: string;

  constructor() {
    this.appDataDir = path.join(app.getPath('userData'), 'x-profiles-manager');
    this.profilesFile = path.join(this.appDataDir, 'profiles.json');
    this.settingsFile = path.join(this.appDataDir, 'settings.json');
    this.foldersFile = path.join(this.appDataDir, 'folders.json');

    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.appDataDir)) {
      fs.mkdirSync(this.appDataDir, { recursive: true });
    }
  }

  // ====== PROFILES ======

  getAllProfiles(): ChromeProfile[] {
    try {
      if (fs.existsSync(this.profilesFile)) {
        const data = fs.readFileSync(this.profilesFile, 'utf-8');
        const profiles: ChromeProfile[] = JSON.parse(data);

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
      ? (JSON.parse(fs.readFileSync(this.profilesFile, 'utf-8')) as ChromeProfile[])
      : [];

    const indexMap = new Map(profileIds.map((id, i) => [id, i]));
    const updated = raw.map(p => ({
      ...p,
      orderIndex: indexMap.has(p.id) ? indexMap.get(p.id)! : (p.orderIndex ?? 999),
    }));
    this.saveProfiles(updated);
  }

  getProfile(profileId: string): ChromeProfile | null {
    const profiles = this.getAllProfiles();
    return profiles.find((p) => p.id === profileId) || null;
  }

  createProfile(
    name: string,
    color: string = '#3b82f6',
    icon: string = '🔗',
    xAccount?: string
  ): ChromeProfile {
    const profiles = this.getAllProfiles();
    const profilesBaseDir = this.getSettings().profilesDir;

    const profile: ChromeProfile = {
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

  updateProfile(profileId: string, updates: Partial<ChromeProfile>): ChromeProfile | null {
    const profiles = this.getAllProfiles();
    const index = profiles.findIndex((p) => p.id === profileId);

    if (index === -1) return null;

    profiles[index] = { ...profiles[index], ...updates, lastAccessed: Date.now() };
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

  private saveProfiles(profiles: ChromeProfile[]): void {
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

    if (process.platform === 'win32') {
      const possiblePaths = [
        path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(
          process.env['ProgramFiles(x86)'] || '',
          'Google',
          'Chrome',
          'Application',
          'chrome.exe'
        ),
      ];
      chromePath = possiblePaths.find((p) => fs.existsSync(p)) || '';
    } else if (process.platform === 'darwin') {
      const possiblePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ];
      chromePath = possiblePaths.find((p) => fs.existsSync(p)) || '';
    } else {
      chromePath = '/usr/bin/google-chrome'; // Linux default
    }

    const profilesDir = path.join(this.appDataDir, '..', 'profiles');
    if (!fs.existsSync(profilesDir)) {
      fs.mkdirSync(profilesDir, { recursive: true });
    }

    return {
      chromePath,
      profilesDir,
      windowLayout: 'floating',
      autoLaunchOnStartup: false,
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

  // ====== BACKUP/RESTORE ======

  async createBackup(outputPath: string): Promise<string> {
    const AdmZip = require('adm-zip');
    
    try {
      if (!outputPath || typeof outputPath !== 'string') {
        throw new Error('Invalid output path for backup');
      }

      const zip = new AdmZip();

      // Add metadata JSON files
      zip.addFile('profiles.json', Buffer.from(fs.readFileSync(this.profilesFile)));
      zip.addFile('folders.json', Buffer.from(fs.readFileSync(this.foldersFile)));
      zip.addFile('settings.json', Buffer.from(fs.readFileSync(this.settingsFile)));

      // Add Chrome profiles directories
      const profilesDir = path.join(this.appDataDir, '..', 'profiles');
      if (fs.existsSync(profilesDir)) {
        const addDirToZip = (dirPath: string, zipPath: string) => {
          try {
            const files = fs.readdirSync(dirPath);
            for (const file of files) {
              const filePath = path.join(dirPath, file);
              try {
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                  addDirToZip(filePath, path.join(zipPath, file));
                } else if (stat.isFile()) {
                  const fileData = fs.readFileSync(filePath);
                  zip.addFile(path.join(zipPath, file), fileData);
                }
                // Ignore symlinks and other special files silently
              } catch (fileError) {
                // Silently skip files that can't be read (broken symlinks, etc)
              }
            }
          } catch (dirError) {
            // Silently skip directories that can't be read
          }
        };
        addDirToZip(profilesDir, 'profiles');
      }

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Write ZIP file
      zip.writeZip(outputPath);
      console.log(`Backup created at: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('Error creating backup:', error);
      throw error;
    }
  }

  async restoreBackup(backupPath: string): Promise<void> {
    const AdmZip = require('adm-zip');
    
    try {
      // Verify backup file exists
      if (!fs.existsSync(backupPath)) {
        throw new Error('Backup file not found');
      }

      const zip = new AdmZip(backupPath);
      const zipEntries = zip.getEntries();

      // Extract metadata files
      const profilesEntry = zipEntries.find((e: any) => e.entryName === 'profiles.json');
      const foldersEntry = zipEntries.find((e: any) => e.entryName === 'folders.json');
      const settingsEntry = zipEntries.find((e: any) => e.entryName === 'settings.json');

      if (!profilesEntry || !foldersEntry || !settingsEntry) {
        throw new Error('Invalid backup file: missing metadata');
      }

      // Backup current data (in case restore fails) — only if files exist
      const currentProfilesData = fs.existsSync(this.profilesFile) ? fs.readFileSync(this.profilesFile, 'utf-8') : null;
      const currentFoldersData = fs.existsSync(this.foldersFile) ? fs.readFileSync(this.foldersFile, 'utf-8') : null;
      const currentSettingsData = fs.existsSync(this.settingsFile) ? fs.readFileSync(this.settingsFile, 'utf-8') : null;

      try {
        // Extract metadata files
        fs.writeFileSync(this.profilesFile, profilesEntry.getData().toString());
        fs.writeFileSync(this.foldersFile, foldersEntry.getData().toString());
        fs.writeFileSync(this.settingsFile, settingsEntry.getData().toString());

        // Extract Chrome profiles
        const profilesDir = path.join(this.appDataDir, '..', 'profiles');
        
        // Clear existing profiles directory with retry logic for Windows
        if (fs.existsSync(profilesDir)) {
          await this.removeDirectoryWithRetry(profilesDir);
        }
        fs.mkdirSync(profilesDir, { recursive: true });

        // Extract all profile directories
        const profileEntries = zipEntries.filter((e: any) => e.entryName.startsWith('profiles/'));
        for (const entry of profileEntries) {
          if (entry.isDirectory) {
            const targetDir = path.join(this.appDataDir, '..', entry.entryName);
            fs.mkdirSync(targetDir, { recursive: true });
          } else {
            const targetPath = path.join(this.appDataDir, '..', entry.entryName);
            const targetDir = path.dirname(targetPath);
            fs.mkdirSync(targetDir, { recursive: true });
            fs.writeFileSync(targetPath, entry.getData());
          }
        }

        console.log('Backup restored successfully');
      } catch (error) {
        // Restore backup on error (only if we have backups)
        console.error('Error during restore, rolling back:', error);
        if (currentProfilesData) fs.writeFileSync(this.profilesFile, currentProfilesData);
        if (currentFoldersData) fs.writeFileSync(this.foldersFile, currentFoldersData);
        if (currentSettingsData) fs.writeFileSync(this.settingsFile, currentSettingsData);
        throw error;
      }
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
