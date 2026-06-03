/**
 * Preload Script - Expone API segura a renderer
 */

import { contextBridge, ipcRenderer } from 'electron';
import { ChromeProfile, AppSettings, ProcessInfo, ProfileFolder } from '../types';

interface ElectronAPI {
  profiles: {
    getAll: () => Promise<ChromeProfile[]>;
    create: (name: string, color?: string, icon?: string, xAccount?: string, folderId?: string) => Promise<ChromeProfile>;
    update: (profileId: string, updates: Partial<ChromeProfile>) => Promise<ChromeProfile | null>;
    delete: (profileId: string) => Promise<boolean>;
    saveOrder: (profileIds: string[]) => Promise<boolean>;
  };
  launcher: {
     launch: (profileId: string, url?: string) => Promise<ProcessInfo | null>;
     close: (profileId: string) => Promise<boolean>;
     closeAll: () => Promise<number>;
     focusWindow: (profileId: string) => Promise<boolean>;
     getActive: () => Promise<string[]>;
     isActive: (profileId: string) => Promise<boolean>;
   };
  folders: {
    getAll: () => Promise<ProfileFolder[]>;
    create: (name: string, color: string, icon: string) => Promise<ProfileFolder>;
    update: (folderId: string, updates: Partial<ProfileFolder>) => Promise<ProfileFolder>;
    delete: (folderId: string) => Promise<boolean>;
    saveOrder: (folderIds: string[]) => Promise<boolean>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    update: (updates: Partial<AppSettings>) => Promise<AppSettings>;
  };
  system: {
    getInfo: () => Promise<any>;
    clearAllData: () => Promise<boolean>;
  };
  dialog: {
    openFile: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string[]>;
    fileToDataUrl: (filePath: string) => Promise<string>;
  };
}

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

const electronAPI: ElectronAPI = {
   profiles: {
     getAll: () => unwrapResponse(ipcRenderer.invoke('profiles:getAll')),
     create: (name, color, icon, xAccount, folderId) =>
       unwrapResponse(ipcRenderer.invoke('profiles:create', name, color, icon, xAccount, folderId)),
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
   },
    dialog: {
      openFile: (options?) =>
        unwrapResponse(ipcRenderer.invoke('dialog:openFile', options)),
      fileToDataUrl: (filePath: string) =>
        unwrapResponse(ipcRenderer.invoke('dialog:fileToDataUrl', filePath)),
    },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
