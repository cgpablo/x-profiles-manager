/**
 * IPC Handlers - Comunicación entre main y renderer
 */

import { ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { storageManager } from './storage';
import { chromeLauncher } from './launcher';
import { passwordManager } from './passwordManager';
import { mailManager } from './mailManager';
import { BrowserProfile, AppSettings, IpcResponse, ProfileFolder, BackupExportOptions, BackupInspection, BackupRestoreResult } from '../types';

export function setupIpcHandlers(): void {
  // Start process monitoring to detect when Chrome windows close
  chromeLauncher.startProcessMonitoring();

  // Load all profile metadata into memory on startup
  const allProfiles = storageManager.getAllProfiles();
  chromeLauncher.loadProfileMetadata(allProfiles);

  // ====== PROFILE HANDLERS ======

  ipcMain.handle('profiles:getAll', async (): Promise<IpcResponse<BrowserProfile[]>> => {
    try {
      const profiles = storageManager.getAllProfiles();
      // Add active status
      const enriched = profiles.map((p) => ({
        ...p,
        isActive: chromeLauncher.getProfileStatus(p.id),
      }));
      return { success: true, data: enriched };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'profiles:create',
    async (_, name: string, color: string, imagePath: string, xAccount?: string, folderId?: string, directoryPath?: string) => {
      try {
        const profile = storageManager.createProfile(name, color, undefined, xAccount);
        // Apply imagePath, folderId, and/or directoryPath if provided
        const extraUpdates: Record<string, unknown> = {};
        if (imagePath) extraUpdates.imagePath = imagePath;
        if (folderId) extraUpdates.folderId = folderId;
        if (directoryPath) extraUpdates.directoryPath = directoryPath;
        
        let finalProfile = profile;
        if (Object.keys(extraUpdates).length > 0) {
          const updated = storageManager.updateProfile(profile.id, extraUpdates);
          if (updated) {
            finalProfile = updated;
          }
        }
        
        // Update metadata map
        chromeLauncher.updateProfileMetadata(finalProfile.id, finalProfile);
        
        return { success: true, data: finalProfile };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('profiles:update', async (_, profileId: string, updates: Partial<BrowserProfile>) => {
    try {
      const profile = storageManager.updateProfile(profileId, updates);
      if (!profile) {
        return { success: false, error: 'Profile not found' };
      }
      // Update metadata map
      chromeLauncher.updateProfileMetadata(profileId, profile);
      return { success: true, data: profile };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('profiles:delete', async (_, profileId: string) => {
    try {
      // Close the profile if it's running
      chromeLauncher.closeProfile(profileId);
      // Delete from storage
      const success = storageManager.deleteProfile(profileId);
      // Delete metadata
      chromeLauncher.deleteProfileMetadata(profileId);
      return { success, data: success };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ====== LAUNCHER HANDLERS ======

  ipcMain.handle('launcher:launch', async (_, profileId: string, url?: string) => {
    try {
      const processInfo = await chromeLauncher.launchProfile(profileId, url);
      if (!processInfo) {
        return { success: false, error: 'Failed to launch profile' };
      }
      
      // After successful launch, check and open extensions if needed
      // Wait a moment for Chrome to fully load, then open extension tabs
      setTimeout(async () => {
        try {
          const profile = storageManager.getProfile(profileId);
          const settings = storageManager.getSettings();
          if (profile && settings) {
            await chromeLauncher.openExtensionsIfNeeded(profile, settings);
          }
        } catch (error) {
          console.error(`Error opening extensions for profile ${profileId}:`, error);
        }
      }, 2000); // Wait 2 seconds for Chrome to load

      // Check X.com login status after browser has had time to restore session
      setTimeout(async () => {
        try {
          const loggedIn = await chromeLauncher.isLoggedIn(profileId);
          storageManager.updateProfile(profileId, {
            xLoggedIn: loggedIn,
            xLoginCheckedAt: Date.now(),
          });
        } catch (error) {
          console.error(`Error checking login status for ${profileId}:`, error);
        }
      }, 6000);

      return { success: true, data: processInfo };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('launcher:close', async (_, profileId: string) => {
    try {
      const success = chromeLauncher.closeProfile(profileId);
      return { success, data: success };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('launcher:getActive', async () => {
    try {
      const active = chromeLauncher.getActiveProfiles();
      return { success: true, data: active };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('launcher:isActive', async (_, profileId: string) => {
    try {
      const isActive = chromeLauncher.getProfileStatus(profileId);
      return { success: true, data: isActive };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('launcher:focusWindow', async (_, profileId: string) => {
    try {
      const success = await chromeLauncher.focusWindow(profileId);
      return { success: true, data: success };
    } catch (error) {
      console.error('Error in focusWindow handler:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('launcher:closeAll', async () => {
    try {
      // Get all profiles and close those that are active
      const allProfiles = storageManager.getAllProfiles();
      let closedCount = 0;
      
      for (const profile of allProfiles) {
        // Check if the profile is actually running
        if (chromeLauncher.getProfileStatus(profile.id)) {
          if (chromeLauncher.closeProfile(profile.id)) {
            closedCount++;
          }
        }
      }
      
      return { success: true, data: closedCount };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('launcher:autoLogin', async (_, profileId: string): Promise<IpcResponse<boolean>> => {
    try {
      const profile = storageManager.getProfile(profileId);
      if (!profile) {
        return { success: false, error: 'Profile not found' };
      }
      const username = profile.xAccount || '';
      if (!username) {
        return { success: false, error: 'No X account configured for this profile' };
      }
      // Get decrypted password
      const password = passwordManager.getDecryptedForProfile(profileId);
      if (!password) {
        return { success: false, error: 'No password linked to this profile' };
      }
      const cleanUsername = username.startsWith('@') ? username.substring(1) : username;
      const result = await chromeLauncher.autoLogin(profileId, cleanUsername, password);

      // If autoLogin succeeded, verify and persist login status after redirect settles
      if (result) {
        setTimeout(async () => {
          try {
            const loggedIn = await chromeLauncher.isLoggedIn(profileId);
            storageManager.updateProfile(profileId, {
              xLoggedIn: loggedIn,
              xLoginCheckedAt: Date.now(),
            });
          } catch {}
        }, 5000);
      }

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('launcher:isLoggedIn', async (_, profileId: string): Promise<IpcResponse<boolean>> => {
    try {
      const result = await chromeLauncher.isLoggedIn(profileId);
      // Persist the current state so UI shows the correct button on next render
      storageManager.updateProfile(profileId, {
        xLoggedIn: result,
        xLoginCheckedAt: Date.now(),
      });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('launcher:isOnHomeUrl', async (_, profileId: string): Promise<IpcResponse<boolean>> => {
    try {
      const result = await chromeLauncher.isOnHomeUrl(profileId);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('launcher:fillPinRecovery', async (_, profileId: string): Promise<IpcResponse<boolean>> => {
    try {
      const profile = storageManager.getProfile(profileId);
      if (!profile) {
        return { success: false, error: 'Profile not found' };
      }
      // No PIN configured is fine — fillPinRecovery will just redirect to /i/chat.
      const pin = profile.pinPasswordId ? passwordManager.getDecryptedById(profile.pinPasswordId) : null;
      const result = await chromeLauncher.fillPinRecovery(profileId, pin);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('launcher:openChat', async (_, profileId: string): Promise<IpcResponse<boolean>> => {
    try {
      const result = await chromeLauncher.openChat(profileId);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ====== SETTINGS HANDLERS ======

  ipcMain.handle('settings:get', async (): Promise<IpcResponse<AppSettings>> => {
    try {
      const settings = storageManager.getSettings();
      return { success: true, data: settings };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('settings:update', async (_, updates: Partial<AppSettings>) => {
    try {
      const current = storageManager.getSettings();
      const updated = { ...current, ...updates };
      storageManager.saveSettings(updated);
      return { success: true, data: updated };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ====== FOLDER HANDLERS ======

  ipcMain.handle('folders:getAll', async (): Promise<IpcResponse<ProfileFolder[]>> => {
    try {
      const folders = storageManager.getAllFolders();
      return { success: true, data: folders };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'folders:create',
    async (_, name: string, color: string, icon: string): Promise<IpcResponse<ProfileFolder>> => {
      try {
        const folder = storageManager.createFolder(name, color, icon);
        return { success: true, data: folder };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('folders:update', async (_, folderId: string, updates: Partial<ProfileFolder>): Promise<IpcResponse<ProfileFolder>> => {
    try {
      const folder = storageManager.updateFolder(folderId, updates);
      return { success: true, data: folder };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('folders:delete', async (_, folderId: string): Promise<IpcResponse<boolean>> => {
    try {
      const success = storageManager.deleteFolder(folderId);
      return { success, data: success };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('folders:saveOrder', async (_, folderIds: string[]): Promise<IpcResponse<boolean>> => {
    try {
      // Update each folder with its new order index
      for (let i = 0; i < folderIds.length; i++) {
        storageManager.updateFolder(folderIds[i], { order: i });
      }
      return { success: true, data: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('profiles:saveOrder', async (_, profileIds: string[]): Promise<IpcResponse<boolean>> => {
    try {
      storageManager.saveProfilesOrder(profileIds);
      return { success: true, data: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ====== SYSTEM HANDLERS ======

  ipcMain.handle('system:getInfo', async () => {
    try {
      return {
        success: true,
        data: {
          platform: process.platform,
          arch: process.arch,
          version: process.version,
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('system:clearAllData', async (): Promise<IpcResponse<boolean>> => {
    try {
      const success = storageManager.clearAllData();
      return { success, data: success };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ====== DIALOG HANDLERS ======

  ipcMain.handle('dialog:openFile', async (_, options?: Electron.OpenDialogOptions) => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        ...options,
      });
      if (result.canceled) return { success: true, data: [] };
      return { success: true, data: result.filePaths };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('dialog:fileToDataUrl', async (_, filePath: string) => {
    try {
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
      };
      const mime = mimeMap[ext] || 'image/jpeg';
      const data = fs.readFileSync(filePath);
      const base64 = data.toString('base64');
      return { success: true, data: `data:${mime};base64,${base64}` };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ====== BACKUP/RESTORE HANDLERS ======

  ipcMain.handle('backup:export', async (): Promise<IpcResponse<boolean>> => {
    try {
      const result = await dialog.showSaveDialog({
        title: 'Export X Profiles Backup',
        defaultPath: `x-profiles-backup-${new Date().toISOString().split('T')[0]}.zip`,
        filters: [
          { name: 'Backup Files', extensions: ['zip'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Export canceled' };
      }

      // Create backup
      await storageManager.createBackup(result.filePath);
      return { success: true, data: true };
    } catch (error) {
      console.error('Export error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('backup:exportSelected', async (_, profileIds: string[], options: Omit<BackupExportOptions, 'profileIds'> = {}): Promise<IpcResponse<boolean>> => {
    try {
      if (!Array.isArray(profileIds) || profileIds.length === 0) {
        return { success: false, error: 'No profiles selected' };
      }

      const result = await dialog.showSaveDialog({
        title: 'Export Selected X Profiles',
        defaultPath: `x-profiles-selected-${new Date().toISOString().split('T')[0]}.zip`,
        filters: [
          { name: 'Backup Files', extensions: ['zip'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Export canceled' };
      }

      await storageManager.createBackup(result.filePath, { ...options, profileIds });
      return { success: true, data: true };
    } catch (error) {
      console.error('Export selected error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('backup:import', async (): Promise<IpcResponse<{ filePath: string; inspection: BackupInspection } | null>> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Import X Profiles Backup',
        properties: ['openFile'],
        filters: [
          { name: 'Backup Files', extensions: ['zip'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, error: 'Import canceled' };
      }

      const filePath = result.filePaths[0];
      return { success: true, data: { filePath, inspection: storageManager.inspectBackup(filePath) } };
    } catch (error) {
      console.error('Import error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('backup:restore', async (_, filePath: string, options: { targetFolderId?: string | null } = {}): Promise<IpcResponse<BackupRestoreResult>> => {
    try {
      const result = await storageManager.restoreBackup(filePath, options);
      return { success: true, data: result };
    } catch (error) {
      console.error('Restore error:', error);
      return { success: false, error: String(error) };
    }
  });

  // ====== ICONS HANDLERS ======

  ipcMain.handle('icons:backup', async (_, filePath: string): Promise<IpcResponse<string>> => {
    try {
      const destPath = storageManager.backupIcon(filePath);
      return { success: true, data: destPath };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('icons:deleteAll', async (): Promise<IpcResponse<boolean>> => {
    try {
      storageManager.deleteAllBackedUpIcons();
      return { success: true, data: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ====== SYSTEM HANDLERS ======

  ipcMain.handle('system:selectFile', async (): Promise<IpcResponse<string>> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Chrome executable',
        properties: ['openFile'],
        filters: [
          { name: 'Chrome Executable', extensions: process.platform === 'darwin' ? [] : ['exe'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, error: 'Selection canceled' };
      }

      return { success: true, data: result.filePaths[0] };
    } catch (error) {
      console.error('Error selecting file:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('system:selectDirectory', async (): Promise<IpcResponse<string>> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select directory',
        properties: ['openDirectory'],
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, error: 'Selection canceled' };
      }

      return { success: true, data: result.filePaths[0] };
    } catch (error) {
      console.error('Error selecting directory:', error);
      return { success: false, error: String(error) };
    }
  });

  // ====== SHELL HANDLERS ======

  ipcMain.handle('shell:openExternal', async (_, url: string): Promise<IpcResponse<boolean>> => {
    try {
      await shell.openExternal(url);
      return { success: true, data: true };
    } catch (error) {
      console.error('Error opening external URL:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('shell:openPath', async (_, filePath: string): Promise<IpcResponse<boolean>> => {
    try {
      await shell.openPath(filePath);
      return { success: true, data: true };
    } catch (error) {
      console.error('Error opening path:', error);
      return { success: false, error: String(error) };
    }
  });

  // ====== PASSWORD MANAGER HANDLERS ======

  ipcMain.handle('passwords:getAll', async (): Promise<IpcResponse<any[]>> => {
    try {
      const entries = passwordManager.getAll();
      return { success: true, data: entries };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'passwords:create',
    async (_, name: string, value: string, profileIds: string[]): Promise<IpcResponse<any>> => {
      try {
        const entry = passwordManager.create(name, value, profileIds);
        return { success: true, data: entry };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle(
    'passwords:update',
    async (_, id: string, updates: { name?: string; value?: string; profileIds?: string[] }): Promise<IpcResponse<any>> => {
      try {
        const entry = passwordManager.update(id, updates);
        if (!entry) return { success: false, error: 'Entry not found' };
        return { success: true, data: entry };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('passwords:delete', async (_, id: string): Promise<IpcResponse<boolean>> => {
    try {
      const ok = passwordManager.delete(id);
      return { success: ok, data: ok };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'passwords:getDecryptedForProfile',
    async (_, profileId: string): Promise<IpcResponse<string | null>> => {
      try {
        const pw = passwordManager.getDecryptedForProfile(profileId);
        return { success: true, data: pw };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle(
    'passwords:getDecryptedById',
    async (_, id: string): Promise<IpcResponse<string | null>> => {
      try {
        const pw = passwordManager.getDecryptedById(id);
        return { success: true, data: pw };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  // ====== MAIL MANAGER HANDLERS ======

  ipcMain.handle('mails:getAll', async (): Promise<IpcResponse<any[]>> => {
    try {
      const entries = mailManager.getAll();
      return { success: true, data: entries };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'mails:create',
    async (_, email: string, profileIds: string[]): Promise<IpcResponse<any>> => {
      try {
        const entry = mailManager.create(email, profileIds);
        return { success: true, data: entry };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle(
    'mails:update',
    async (_, id: string, updates: { email?: string; profileIds?: string[] }): Promise<IpcResponse<any>> => {
      try {
        const entry = mailManager.update(id, updates);
        if (!entry) return { success: false, error: 'Entry not found' };
        return { success: true, data: entry };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('mails:delete', async (_, id: string): Promise<IpcResponse<boolean>> => {
    try {
      const ok = mailManager.delete(id);
      return { success: ok, data: ok };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

}
