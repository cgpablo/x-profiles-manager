/**
 * IPC Handlers - Comunicación entre main y renderer.
 *
 * Esta capa solo registra canales: la lógica vive en `core` (vía `backend`).
 * Aquí se queda lo que es propio de Electron: diálogos, shell y acceso a ficheros del backup.
 */

import { ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { chromeLauncher } from './launcher';
import { data } from './storageServices';
import { backend } from './backend';
import { UserFacingError } from '@xpm/core';
import { BackupExportOptions, IpcResponse } from '@xpm/core';

const errorMessage = (error: unknown): string =>
  error instanceof UserFacingError ? error.message : String(error);

/** Registra un canal: devuelve `{ success, data }` o `{ success: false, error }`. */
function handle(channel: string, fn: (...args: any[]) => Promise<unknown> | unknown): void {
  ipcMain.handle(channel, async (_event, ...args: any[]): Promise<IpcResponse<any>> => {
    try {
      return { success: true, data: await fn(...args) };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  });
}

/** Canal booleano: `false` se informa como fallo (sin mensaje), igual que antes. */
function handleBool(channel: string, fn: (...args: any[]) => Promise<boolean>): void {
  ipcMain.handle(channel, async (_event, ...args: any[]): Promise<IpcResponse<any>> => {
    try {
      const ok = await fn(...args);
      return { success: ok, data: ok };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  });
}

/** Canal que busca por id: `null` se informa como `notFound`. */
function handleFound(channel: string, notFound: string, fn: (...args: any[]) => Promise<unknown | null>): void {
  ipcMain.handle(channel, async (_event, ...args: any[]): Promise<IpcResponse<any>> => {
    try {
      const result = await fn(...args);
      if (result === null) return { success: false, error: notFound };
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  });
}

const BACKUP_FILTERS = [
  { name: 'Backup Files', extensions: ['zip'] },
  { name: 'All Files', extensions: ['*'] },
];

function readBackupFile(filePath: string): Uint8Array {
  if (!fs.existsSync(filePath)) {
    throw new Error('Backup file not found');
  }
  return fs.readFileSync(filePath);
}

function writeBackupFile(outputPath: string, bytes: Uint8Array): void {
  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('Invalid output path for backup');
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, bytes);
  console.log(`Backup exported to: ${outputPath}`);
}

export function setupIpcHandlers(): void {
  // Start process monitoring to detect when browser windows close
  chromeLauncher.startProcessMonitoring();

  // Load all profile metadata into the launcher on startup
  chromeLauncher.loadProfileMetadata(data.profiles.getAll());

  // ====== PROFILE HANDLERS ======

  handle('profiles:getAll', () => backend.profiles.getAll());
  handle('profiles:create', (name, color, imagePath, xAccount, folderId, directoryPath) =>
    backend.profiles.create(name, color, imagePath, xAccount, folderId, directoryPath)
  );
  handleFound('profiles:update', 'Profile not found', (profileId, updates) =>
    backend.profiles.update(profileId, updates)
  );
  handleBool('profiles:delete', (profileId) => backend.profiles.delete(profileId));
  handle('profiles:saveOrder', (profileIds) => backend.profiles.saveOrder(profileIds));

  // ====== LAUNCHER HANDLERS ======

  handle('launcher:launch', (profileId, url) => backend.launcher.launch(profileId, url));
  handleBool('launcher:close', (profileId) => backend.launcher.close(profileId));
  handle('launcher:getActive', () => backend.launcher.getActive());
  handle('launcher:isActive', (profileId) => backend.launcher.isActive(profileId));
  handle('launcher:focusWindow', async (profileId) => {
    try {
      return await backend.launcher.focusWindow(profileId);
    } catch (error) {
      console.error('Error in focusWindow handler:', error);
      throw error;
    }
  });
  handle('launcher:closeAll', () => backend.launcher.closeAll());
  handle('launcher:autoLogin', (profileId) => backend.launcher.autoLogin(profileId));
  handle('launcher:isLoggedIn', (profileId) => backend.launcher.isLoggedIn(profileId));
  handle('launcher:isOnHomeUrl', (profileId) => backend.launcher.isOnHomeUrl(profileId));
  handle('launcher:fillPinRecovery', (profileId) => backend.launcher.fillPinRecovery(profileId));
  handle('launcher:openChat', (profileId) => backend.launcher.openChat(profileId));

  // ====== SETTINGS HANDLERS ======

  handle('settings:get', () => backend.settings.get());
  handle('settings:update', (updates) => backend.settings.update(updates));

  // ====== FOLDER HANDLERS ======

  handle('folders:getAll', () => backend.folders.getAll());
  handle('folders:create', (name, color, icon) => backend.folders.create(name, color, icon));
  handle('folders:update', (folderId, updates) => backend.folders.update(folderId, updates));
  handleBool('folders:delete', (folderId) => backend.folders.delete(folderId));
  handle('folders:saveOrder', (folderIds) => backend.folders.saveOrder(folderIds));

  // ====== SYSTEM HANDLERS ======

  handle('system:getInfo', () => ({
    platform: process.platform,
    arch: process.arch,
    version: process.version,
  }));
  handleBool('system:clearAllData', () => backend.system.clearAllData());

  // ====== DIALOG HANDLERS ======

  handle('dialog:openFile', async (options?: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      ...options,
    });
    return result.canceled ? [] : result.filePaths;
  });

  handle('dialog:fileToDataUrl', (filePath: string) => {
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
    };
    const mime = mimeMap[ext] || 'image/jpeg';
    const base64 = fs.readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${base64}`;
  });

  // ====== BACKUP/RESTORE HANDLERS ======

  handle('backup:export', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export X Profiles Backup',
      defaultPath: `x-profiles-backup-${new Date().toISOString().split('T')[0]}.zip`,
      filters: BACKUP_FILTERS,
    });
    if (result.canceled || !result.filePath) {
      throw new UserFacingError('Export canceled');
    }
    writeBackupFile(result.filePath, await backend.backup.exportBytes());
    return true;
  });

  handle(
    'backup:exportSelected',
    async (profileIds: string[], options: Omit<BackupExportOptions, 'profileIds'> = {}) => {
      if (!Array.isArray(profileIds) || profileIds.length === 0) {
        throw new UserFacingError('No profiles selected');
      }
      const result = await dialog.showSaveDialog({
        title: 'Export Selected X Profiles',
        defaultPath: `x-profiles-selected-${new Date().toISOString().split('T')[0]}.zip`,
        filters: BACKUP_FILTERS,
      });
      if (result.canceled || !result.filePath) {
        throw new UserFacingError('Export canceled');
      }
      writeBackupFile(result.filePath, await backend.backup.exportBytes({ ...options, profileIds }));
      return true;
    }
  );

  handle('backup:import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import X Profiles Backup',
      properties: ['openFile'],
      filters: BACKUP_FILTERS,
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      throw new UserFacingError('Import canceled');
    }
    const filePath = result.filePaths[0];
    return { filePath, inspection: await backend.backup.inspect(readBackupFile(filePath)) };
  });

  handle('backup:restore', async (filePath: string, options: { targetFolderId?: string | null } = {}) =>
    backend.backup.restore(readBackupFile(filePath), options)
  );

  // ====== ICONS HANDLERS ======

  handle('icons:backup', (filePath: string) => backend.icons.backup(filePath));
  handle('icons:deleteAll', () => backend.icons.deleteAll());

  // ====== FILE/DIRECTORY SELECTION ======

  handle('system:selectFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Chrome executable',
      properties: ['openFile'],
      filters: [
        { name: 'Chrome Executable', extensions: process.platform === 'darwin' ? [] : ['exe'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      throw new UserFacingError('Selection canceled');
    }
    return result.filePaths[0];
  });

  handle('system:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select directory',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      throw new UserFacingError('Selection canceled');
    }
    return result.filePaths[0];
  });

  // ====== SHELL HANDLERS ======

  handle('shell:openExternal', async (url: string) => {
    await shell.openExternal(url);
    return true;
  });
  handle('shell:openPath', async (filePath: string) => {
    await shell.openPath(filePath);
    return true;
  });

  // ====== PASSWORD MANAGER HANDLERS ======

  handle('passwords:getAll', () => backend.passwords.getAll());
  handle('passwords:create', (name, value, profileIds) => backend.passwords.create(name, value, profileIds));
  handleFound('passwords:update', 'Entry not found', (id, updates) => backend.passwords.update(id, updates));
  handleBool('passwords:delete', (id) => backend.passwords.delete(id));
  handle('passwords:getDecryptedForProfile', (profileId) => backend.passwords.getDecryptedForProfile(profileId));
  handle('passwords:getDecryptedById', (id) => backend.passwords.getDecryptedById(id));

  // ====== MAIL MANAGER HANDLERS ======

  handle('mails:getAll', () => backend.mails.getAll());
  handle('mails:create', (email, profileIds) => backend.mails.create(email, profileIds));
  handleFound('mails:update', 'Entry not found', (id, updates) => backend.mails.update(id, updates));
  handleBool('mails:delete', (id) => backend.mails.delete(id));
}
