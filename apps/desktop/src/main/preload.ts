/**
 * Preload Script - Expone API segura a renderer
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { BackupExportOptions, PlatformAPI, PlatformCapabilities } from '@xpm/core';

/**
 * Helper function to unwrap IPC responses
 */
const unwrapResponse = async <T>(promise: Promise<any>): Promise<T> => {
  const response = await promise;
  if (response && response.success) {
    return response.data as T;
  }
  if (response && response.error) {
    throw new Error(response.error);
  }
  throw new Error('Unknown error from main process');
};

const capabilities: PlatformCapabilities = {
  browserPaths: true,
  profilesDir: true,
  windowManagement: true,
  openDirectory: true,
  perProfileExtensions: true,
  autoLaunchOnStartup: true,
  browserView: false,
};

const platformAPI: PlatformAPI = {
   platform: process.platform as 'darwin' | 'win32' | 'linux',
   capabilities,
    profiles: {
     getAll: () => unwrapResponse(ipcRenderer.invoke('profiles:getAll')),
     create: (name, color, icon, xAccount, folderId, directoryPath) =>
       unwrapResponse(ipcRenderer.invoke('profiles:create', name, color, icon, xAccount, folderId, directoryPath)),
     update: (profileId, updates) =>
       unwrapResponse(ipcRenderer.invoke('profiles:update', profileId, updates)),
     delete: (profileId) =>
       unwrapResponse(ipcRenderer.invoke('profiles:delete', profileId)),
     saveOrder: (profileIds) =>
       unwrapResponse(ipcRenderer.invoke('profiles:saveOrder', profileIds)),
   },
   launcher: {
     launch: (profileId, url) =>
       unwrapResponse(ipcRenderer.invoke('launcher:launch', profileId, url)),
     close: (profileId) =>
       unwrapResponse(ipcRenderer.invoke('launcher:close', profileId)),
     closeAll: () =>
       unwrapResponse(ipcRenderer.invoke('launcher:closeAll')),
     focusWindow: (profileId) =>
       unwrapResponse(ipcRenderer.invoke('launcher:focusWindow', profileId)),
     getActive: () => unwrapResponse(ipcRenderer.invoke('launcher:getActive')),
      isActive: (profileId) =>
        unwrapResponse(ipcRenderer.invoke('launcher:isActive', profileId)),
      autoLogin: (profileId: string) =>
        unwrapResponse(ipcRenderer.invoke('launcher:autoLogin', profileId)),
      isLoggedIn: (profileId: string) =>
        unwrapResponse(ipcRenderer.invoke('launcher:isLoggedIn', profileId)),
      isOnHomeUrl: (profileId: string) =>
        unwrapResponse(ipcRenderer.invoke('launcher:isOnHomeUrl', profileId)),
      fillPinRecovery: (profileId: string) =>
        unwrapResponse(ipcRenderer.invoke('launcher:fillPinRecovery', profileId)),
      openChat: (profileId: string) =>
        unwrapResponse(ipcRenderer.invoke('launcher:openChat', profileId)),
    },
   folders: {
     getAll: () => unwrapResponse(ipcRenderer.invoke('folders:getAll')),
     create: (name, color, icon) =>
       unwrapResponse(ipcRenderer.invoke('folders:create', name, color, icon)),
     update: (folderId, updates) =>
       unwrapResponse(ipcRenderer.invoke('folders:update', folderId, updates)),
     delete: (folderId) =>
       unwrapResponse(ipcRenderer.invoke('folders:delete', folderId)),
     saveOrder: (folderIds) =>
       unwrapResponse(ipcRenderer.invoke('folders:saveOrder', folderIds)),
   },
  settings: {
    get: () => unwrapResponse(ipcRenderer.invoke('settings:get')),
    update: (updates) =>
      unwrapResponse(ipcRenderer.invoke('settings:update', updates)),
  },
   system: {
      getInfo: () => unwrapResponse(ipcRenderer.invoke('system:getInfo')),
      clearAllData: () => unwrapResponse(ipcRenderer.invoke('system:clearAllData')),
      selectFile: () => unwrapResponse(ipcRenderer.invoke('system:selectFile')),
      selectDirectory: () => unwrapResponse(ipcRenderer.invoke('system:selectDirectory')),
    },
     dialog: {
       openFile: (options?) =>
         unwrapResponse(ipcRenderer.invoke('dialog:openFile', options)),
       fileToDataUrl: (filePath: string) =>
         unwrapResponse(ipcRenderer.invoke('dialog:fileToDataUrl', filePath)),
     },
     backup: {
       export: () =>
         unwrapResponse(ipcRenderer.invoke('backup:export')),
        exportSelected: (profileIds: string[], options: Omit<BackupExportOptions, "profileIds"> = {}) =>
          unwrapResponse(ipcRenderer.invoke('backup:exportSelected', profileIds, options)),
       import: () =>
         unwrapResponse(ipcRenderer.invoke('backup:import')),
       restore: (filePath: string, options: { targetFolderId?: string | null } = {}) =>
         unwrapResponse(ipcRenderer.invoke('backup:restore', filePath, options)),
     },
      icons: {
        backup: (filePath: string) =>
          unwrapResponse<string>(ipcRenderer.invoke('icons:backup', filePath)),
        deleteAll: () =>
          unwrapResponse<boolean>(ipcRenderer.invoke('icons:deleteAll')),
      },
       shell: {
         openExternal: (url: string) =>
           unwrapResponse<boolean>(ipcRenderer.invoke('shell:openExternal', url)),
         openPath: (filePath: string) =>
           unwrapResponse<boolean>(ipcRenderer.invoke('shell:openPath', filePath)),
       },
        passwords: {
          getAll: () =>
            unwrapResponse(ipcRenderer.invoke('passwords:getAll')),
          create: (name: string, value: string, profileIds: string[]) =>
            unwrapResponse(ipcRenderer.invoke('passwords:create', name, value, profileIds)),
          update: (id: string, updates: { name?: string; value?: string; profileIds?: string[] }) =>
            unwrapResponse(ipcRenderer.invoke('passwords:update', id, updates)),
          delete: (id: string) =>
            unwrapResponse<boolean>(ipcRenderer.invoke('passwords:delete', id)),
          getDecryptedForProfile: (profileId: string) =>
            unwrapResponse<string | null>(ipcRenderer.invoke('passwords:getDecryptedForProfile', profileId)),
          getDecryptedById: (id: string) =>
            unwrapResponse<string | null>(ipcRenderer.invoke('passwords:getDecryptedById', id)),
        },
        mails: {
          getAll: () =>
            unwrapResponse(ipcRenderer.invoke('mails:getAll')),
          create: (email: string, profileIds: string[]) =>
            unwrapResponse(ipcRenderer.invoke('mails:create', email, profileIds)),
          update: (id: string, updates: { email?: string; profileIds?: string[] }) =>
            unwrapResponse(ipcRenderer.invoke('mails:update', id, updates)),
          delete: (id: string) =>
            unwrapResponse<boolean>(ipcRenderer.invoke('mails:delete', id)),
        },
};

contextBridge.exposeInMainWorld('platformAPI', platformAPI);

declare global {
  interface Window {
    platformAPI: PlatformAPI;
  }
}
