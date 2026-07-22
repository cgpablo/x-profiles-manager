/**
 * Global type definitions for Electron API and Electron-specific DOM elements.
 */

import { BrowserProfile, AppSettings, ProcessInfo, ProfileFolder } from '../types';

// ──────────────────────────────────────────────────────────────────────────────
// ElectronAPI (exposed via contextBridge in preload.ts)
// ──────────────────────────────────────────────────────────────────────────────

interface ElectronAPI {
  profiles: {
    getAll: () => Promise<BrowserProfile[]>;
    create: (name: string, color?: string, icon?: string, xAccount?: string, folderId?: string, directoryPath?: string) => Promise<BrowserProfile>;
    update: (profileId: string, updates: Partial<BrowserProfile>) => Promise<BrowserProfile | null>;
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
    autoLogin: (profileId: string) => Promise<boolean>;
    isLoggedIn: (profileId: string) => Promise<boolean>;
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
    selectDirectory: () => Promise<string | null>;
  };
  dialog: {
    openFile: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string[]>;
    fileToDataUrl: (filePath: string) => Promise<string>;
  };
  passwords: {
    getAll: () => Promise<Array<{ id: string; name: string; profileIds: string[]; createdAt: number; updatedAt?: number }>>;
    create: (name: string, value: string, profileIds: string[]) => Promise<any>;
    update: (id: string, updates: { name?: string; value?: string; profileIds?: string[] }) => Promise<any>;
    delete: (id: string) => Promise<boolean>;
    getDecryptedForProfile: (profileId: string) => Promise<string | null>;
  };
  mails: {
    getAll: () => Promise<Array<{ id: string; email: string; profileIds: string[]; createdAt: number; updatedAt?: number }>>;
    create: (email: string, profileIds: string[]) => Promise<any>;
    update: (id: string, updates: { email?: string; profileIds?: string[] }) => Promise<any>;
    delete: (id: string) => Promise<boolean>;
  };
  shell: {
    openExternal: (url: string) => Promise<boolean>;
    openPath: (filePath: string) => Promise<boolean>;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// <webview> JSX element (Electron-specific)
// ──────────────────────────────────────────────────────────────────────────────

interface WebviewHTMLAttributes extends React.HTMLAttributes<HTMLElement> {
  src?: string;
  partition?: string;
  allowpopups?: string;
  preload?: string;
  httpreferrer?: string;
  useragent?: string;
  disablewebsecurity?: string;
  nodeintegration?: string;
  nodeintegrationinsubframes?: string;
  plugins?: string;
  webpreferences?: string;
  disableblinkfeatures?: string;
  enableblinkfeatures?: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: WebviewHTMLAttributes;
    }
  }
}
