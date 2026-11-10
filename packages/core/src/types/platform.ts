/**
 * PlatformAPI: contrato único entre la UI (renderer) y cada plataforma
 * (Electron en desktop, Capacitor en Android).
 *
 * La UI solo depende de esta interfaz. Cada plataforma la implementa y la
 * expone en `window.platformAPI`.
 */

import {
  BrowserProfile,
  AppSettings,
  ProcessInfo,
  ProfileFolder,
  BackupExportOptions,
  BackupInspection,
  BackupRestoreResult,
} from './index';

export type PlatformId = 'darwin' | 'win32' | 'linux' | 'android';

/**
 * Qué puede hacer la plataforma actual. La UI oculta lo que no aplique.
 */
export interface PlatformCapabilities {
  /** El usuario configura el ejecutable del navegador (Chrome/Edge/Gecko). */
  browserPaths: boolean;
  /** El usuario elige el directorio donde se guardan los perfiles del navegador. */
  profilesDir: boolean;
  /** Se gestionan ventanas del navegador: enfocar, disposición en mosaico. */
  windowManagement: boolean;
  /** Se puede abrir un directorio del sistema de ficheros desde un perfil. */
  openDirectory: boolean;
  /** Las extensiones se configuran por perfil (si es false, son globales). */
  perProfileExtensions: boolean;
  /** La app puede arrancar sola al iniciar el sistema. */
  autoLaunchOnStartup: boolean;
  /** El navegador es una pantalla propia de la app a la que se puede volver (Android). */
  browserView: boolean;
}

export interface PasswordSummary {
  id: string;
  name: string;
  profileIds: string[];
  createdAt: number;
  updatedAt?: number;
}

export interface MailSummary {
  id: string;
  email: string;
  profileIds: string[];
  createdAt: number;
  updatedAt?: number;
}

export interface PlatformAPI {
  platform: PlatformId;
  capabilities: PlatformCapabilities;

  profiles: {
    getAll: () => Promise<BrowserProfile[]>;
    create: (
      name: string,
      color?: string,
      icon?: string,
      xAccount?: string,
      folderId?: string,
      directoryPath?: string
    ) => Promise<BrowserProfile>;
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
    isOnHomeUrl: (profileId: string) => Promise<boolean>;
    fillPinRecovery: (profileId: string) => Promise<boolean>;
    openChat: (profileId: string) => Promise<boolean>;
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
    selectFile: () => Promise<string>;
    selectDirectory: () => Promise<string>;
  };

  dialog: {
    openFile: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string[]>;
    fileToDataUrl: (filePath: string) => Promise<string>;
  };

  backup: {
    export: () => Promise<boolean>;
    exportSelected: (
      profileIds: string[],
      options?: Omit<BackupExportOptions, 'profileIds'>
    ) => Promise<boolean>;
    /** Si el usuario cancela, la promesa se rechaza (igual que selectFile/selectDirectory). */
    import: () => Promise<{ filePath: string; inspection: BackupInspection }>;
    restore: (filePath: string, options?: { targetFolderId?: string | null }) => Promise<BackupRestoreResult>;
  };

  icons: {
    backup: (filePath: string) => Promise<string>;
    deleteAll: () => Promise<boolean>;
  };

  shell: {
    openExternal: (url: string) => Promise<boolean>;
    openPath: (filePath: string) => Promise<boolean>;
  };

  passwords: {
    getAll: () => Promise<PasswordSummary[]>;
    create: (name: string, value: string, profileIds: string[]) => Promise<any>;
    update: (id: string, updates: { name?: string; value?: string; profileIds?: string[] }) => Promise<any>;
    delete: (id: string) => Promise<boolean>;
    getDecryptedForProfile: (profileId: string) => Promise<string | null>;
    getDecryptedById: (id: string) => Promise<string | null>;
  };

  mails: {
    getAll: () => Promise<MailSummary[]>;
    create: (email: string, profileIds: string[]) => Promise<any>;
    update: (id: string, updates: { email?: string; profileIds?: string[] }) => Promise<any>;
    delete: (id: string) => Promise<boolean>;
  };
}
