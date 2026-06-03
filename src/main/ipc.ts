/**
 * IPC Handlers - Comunicación entre main y renderer
 */

import { ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { storageManager } from './storage';
import { chromeLauncher } from './launcher';
import { ChromeProfile, AppSettings, IpcResponse, ProfileFolder } from '../types';

export function setupIpcHandlers(): void {
  // Start process monitoring to detect when Chrome windows close
  chromeLauncher.startProcessMonitoring();

  // ====== PROFILE HANDLERS ======

  ipcMain.handle('profiles:getAll', async (): Promise<IpcResponse<ChromeProfile[]>> => {
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
    async (_, name: string, color: string, imagePath: string, xAccount?: string, folderId?: string) => {
      try {
        const profile = storageManager.createProfile(name, color, undefined, xAccount);
        // Apply imagePath and/or folderId if provided
        const extraUpdates: Record<string, unknown> = {};
        if (imagePath) extraUpdates.imagePath = imagePath;
        if (folderId) extraUpdates.folderId = folderId;
        if (Object.keys(extraUpdates).length > 0) {
          const updatedProfile = storageManager.updateProfile(profile.id, extraUpdates);
          return { success: true, data: updatedProfile };
        }
        return { success: true, data: profile };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('profiles:update', async (_, profileId: string, updates: Partial<ChromeProfile>) => {
    try {
      const profile = storageManager.updateProfile(profileId, updates);
      return { success: true, data: profile };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('profiles:delete', async (_, profileId: string) => {
    try {
      const success = storageManager.deleteProfile(profileId);
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
      const success = chromeLauncher.focusWindow(profileId);
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

  ipcMain.handle('backup:import', async (): Promise<IpcResponse<boolean>> => {
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

      const backupPath = result.filePaths[0];

      // Restore backup
      await storageManager.restoreBackup(backupPath);
      return { success: true, data: true };
    } catch (error) {
      console.error('Import error:', error);
      return { success: false, error: String(error) };
    }
  });

}
