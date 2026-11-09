/**
 * Backend: la lógica de la app independiente de la plataforma.
 *
 * Expone las mismas operaciones que `PlatformAPI`, pero sin diálogos, rutas de ficheros
 * ni IPC: eso lo pone cada plataforma. Cada plataforma la conecta a su canal
 * (ipcMain en Electron, plugin en Capacitor).
 *
 * Convenciones:
 * - Los errores que el usuario debe ver se lanzan como `UserFacingError`.
 * - Las operaciones booleanas devuelven `false` si no han hecho nada (la plataforma decide cómo mostrarlo).
 * - Las que buscan por id devuelven `null` si no existe.
 */

import {
  AppSettings,
  BackupExportOptions,
  BackupInspection,
  BackupRestoreResult,
  BrowserProfile,
  ProcessInfo,
  ProfileFolder,
} from '../types';
import { CoreDeps, BrowserLauncher } from './ports';
import { UserFacingError } from './errors';
import { SettingsService } from './settingsService';
import { ProfileService } from './profileService';
import { FolderService } from './folderService';
import { PasswordService, PasswordSummary } from './passwordService';
import { MailService } from './mailService';
import { BackupService } from './backupService';

export interface DataServices {
  settings: SettingsService;
  profiles: ProfileService;
  folders: FolderService;
  passwords: PasswordService;
  mails: MailService;
  backup: BackupService;
}

/** Servicios de datos, sin lanzador. Es lo que necesita cualquier consumidor de datos. */
export function createDataServices(deps: CoreDeps): DataServices {
  const settings = new SettingsService(deps);
  const profiles = new ProfileService(deps, settings);
  const folders = new FolderService(deps, profiles);
  const passwords = new PasswordService(deps);
  const mails = new MailService(deps);
  const backup = new BackupService(deps, profiles, folders, passwords, mails);
  return { settings, profiles, folders, passwords, mails, backup };
}

export interface Backend {
  profiles: {
    getAll(): Promise<BrowserProfile[]>;
    create(
      name: string,
      color?: string,
      imagePath?: string,
      xAccount?: string,
      folderId?: string,
      directoryPath?: string
    ): Promise<BrowserProfile>;
    update(profileId: string, updates: Partial<BrowserProfile>): Promise<BrowserProfile | null>;
    delete(profileId: string): Promise<boolean>;
    saveOrder(profileIds: string[]): Promise<boolean>;
  };
  launcher: {
    launch(profileId: string, url?: string): Promise<ProcessInfo>;
    close(profileId: string): Promise<boolean>;
    closeAll(): Promise<number>;
    focusWindow(profileId: string): Promise<boolean>;
    getActive(): Promise<string[]>;
    isActive(profileId: string): Promise<boolean>;
    autoLogin(profileId: string): Promise<boolean>;
    isLoggedIn(profileId: string): Promise<boolean>;
    isOnHomeUrl(profileId: string): Promise<boolean>;
    fillPinRecovery(profileId: string): Promise<boolean>;
    openChat(profileId: string): Promise<boolean>;
  };
  folders: {
    getAll(): Promise<ProfileFolder[]>;
    create(name: string, color: string, icon: string): Promise<ProfileFolder>;
    update(folderId: string, updates: Partial<ProfileFolder>): Promise<ProfileFolder>;
    delete(folderId: string): Promise<boolean>;
    saveOrder(folderIds: string[]): Promise<boolean>;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(updates: Partial<AppSettings>): Promise<AppSettings>;
  };
  system: {
    clearAllData(): Promise<boolean>;
  };
  icons: {
    backup(filePath: string): Promise<string>;
    deleteAll(): Promise<boolean>;
  };
  backup: {
    /** Genera el zip del backup. Guardarlo donde corresponda es cosa de la plataforma. */
    exportBytes(options?: BackupExportOptions): Promise<Uint8Array>;
    inspect(bytes: Uint8Array): Promise<BackupInspection>;
    restore(bytes: Uint8Array, options?: { targetFolderId?: string | null }): Promise<BackupRestoreResult>;
  };
  passwords: {
    getAll(): Promise<PasswordSummary[]>;
    create(name: string, value: string, profileIds: string[]): Promise<PasswordSummary>;
    update(
      id: string,
      updates: { name?: string; value?: string; profileIds?: string[] }
    ): Promise<PasswordSummary | null>;
    delete(id: string): Promise<boolean>;
    getDecryptedForProfile(profileId: string): Promise<string | null>;
    getDecryptedById(id: string): Promise<string | null>;
  };
  mails: {
    getAll(): Promise<Array<{ id: string; email: string; profileIds: string[]; createdAt: number; updatedAt?: number }>>;
    create(email: string, profileIds: string[]): Promise<any>;
    update(id: string, updates: { email?: string; profileIds?: string[] }): Promise<any | null>;
    delete(id: string): Promise<boolean>;
  };
}

export function createBackend(data: DataServices, launcher: BrowserLauncher, deps: CoreDeps): Backend {
  /** Persiste el estado de sesión de X de un perfil. */
  const persistLoginState = (profileId: string, loggedIn: boolean) => {
    data.profiles.update(profileId, { xLoggedIn: loggedIn, xLoginCheckedAt: deps.now() });
  };

  return {
    profiles: {
      async getAll() {
        // Add active status
        return data.profiles.getAll().map((p) => ({ ...p, isActive: launcher.isActive(p.id) }));
      },

      async create(name, color, imagePath, xAccount, folderId, directoryPath) {
        const profile = data.profiles.create(name, color, undefined, xAccount);
        // Apply imagePath, folderId, and/or directoryPath if provided
        const extraUpdates: Partial<BrowserProfile> = {};
        if (imagePath) extraUpdates.imagePath = imagePath;
        if (folderId) extraUpdates.folderId = folderId;
        if (directoryPath) extraUpdates.directoryPath = directoryPath;

        let finalProfile = profile;
        if (Object.keys(extraUpdates).length > 0) {
          const updated = data.profiles.update(profile.id, extraUpdates);
          if (updated) {
            finalProfile = updated;
          }
        }

        launcher.profileSaved?.(finalProfile);
        return finalProfile;
      },

      async update(profileId, updates) {
        const profile = data.profiles.update(profileId, updates);
        if (!profile) return null;
        launcher.profileSaved?.(profile);
        return profile;
      },

      async delete(profileId) {
        // Close the profile if it's running
        launcher.close(profileId);
        const success = data.profiles.delete(profileId);
        launcher.profileDeleted?.(profileId);
        return success;
      },

      async saveOrder(profileIds) {
        data.profiles.saveOrder(profileIds);
        return true;
      },
    },

    launcher: {
      async launch(profileId, url) {
        const processInfo = await launcher.launch(profileId, url);
        if (!processInfo) {
          throw new UserFacingError('Failed to launch profile');
        }

        // After a successful launch, let the launcher do its follow-up work
        // (e.g. open extension tabs once the browser has loaded)
        if (launcher.afterLaunch) {
          setTimeout(async () => {
            try {
              const profile = data.profiles.get(profileId);
              const settings = data.settings.get();
              if (profile && settings) {
                await launcher.afterLaunch!(profile, settings);
              }
            } catch (error) {
              console.error(`Error opening extensions for profile ${profileId}:`, error);
            }
          }, 2000);
        }

        // Check X.com login status after the browser has had time to restore the session
        setTimeout(async () => {
          try {
            persistLoginState(profileId, await launcher.isLoggedIn(profileId));
          } catch (error) {
            console.error(`Error checking login status for ${profileId}:`, error);
          }
        }, 6000);

        return processInfo;
      },

      async close(profileId) {
        return launcher.close(profileId);
      },

      async closeAll() {
        // Close every profile that is actually running
        let closedCount = 0;
        for (const profile of data.profiles.getAll()) {
          if (launcher.isActive(profile.id)) {
            if (launcher.close(profile.id)) {
              closedCount++;
            }
          }
        }
        return closedCount;
      },

      async focusWindow(profileId) {
        return launcher.focusWindow(profileId);
      },

      async getActive() {
        return launcher.getActive();
      },

      async isActive(profileId) {
        return launcher.isActive(profileId);
      },

      async autoLogin(profileId) {
        const profile = data.profiles.get(profileId);
        if (!profile) {
          throw new UserFacingError('Profile not found');
        }
        const username = profile.xAccount || '';
        if (!username) {
          throw new UserFacingError('No X account configured for this profile');
        }
        const password = data.passwords.getDecryptedForProfile(profileId);
        if (!password) {
          throw new UserFacingError('No password linked to this profile');
        }
        const cleanUsername = username.startsWith('@') ? username.substring(1) : username;
        const result = await launcher.autoLogin(profileId, cleanUsername, password);

        // If autoLogin succeeded, verify and persist login status after the redirect settles
        if (result) {
          setTimeout(async () => {
            try {
              persistLoginState(profileId, await launcher.isLoggedIn(profileId));
            } catch {}
          }, 5000);
        }

        return result;
      },

      async isLoggedIn(profileId) {
        const result = await launcher.isLoggedIn(profileId);
        // Persist the current state so the UI shows the correct button on next render
        persistLoginState(profileId, result);
        return result;
      },

      async isOnHomeUrl(profileId) {
        return launcher.isOnHomeUrl(profileId);
      },

      async fillPinRecovery(profileId) {
        const profile = data.profiles.get(profileId);
        if (!profile) {
          throw new UserFacingError('Profile not found');
        }
        // No PIN configured is fine — it will just redirect to /i/chat.
        const pin = profile.pinPasswordId ? data.passwords.getDecryptedById(profile.pinPasswordId) : null;
        return launcher.fillPinRecovery(profileId, pin);
      },

      async openChat(profileId) {
        return launcher.openChat(profileId);
      },
    },

    folders: {
      async getAll() {
        return data.folders.getAll();
      },
      async create(name, color, icon) {
        return data.folders.create(name, color, icon);
      },
      async update(folderId, updates) {
        return data.folders.update(folderId, updates);
      },
      async delete(folderId) {
        return data.folders.delete(folderId);
      },
      async saveOrder(folderIds) {
        // Update each folder with its new order index
        for (let i = 0; i < folderIds.length; i++) {
          data.folders.update(folderIds[i], { order: i });
        }
        return true;
      },
    },

    settings: {
      async get() {
        return data.settings.get();
      },
      async update(updates) {
        return data.settings.update(updates);
      },
    },

    system: {
      async clearAllData() {
        try {
          // Passwords and mails are intentionally kept (same as before)
          deps.documents.remove('profiles');
          deps.documents.remove('folders');
          deps.documents.remove('settings');
          // Re-initialize with default settings
          data.settings.initDefaults();
          return true;
        } catch (error) {
          console.error('Error clearing data:', error);
          return false;
        }
      },
    },

    icons: {
      async backup(filePath) {
        return deps.assets.importIcon(filePath);
      },
      async deleteAll() {
        await deps.assets.deleteAllIcons();
        return true;
      },
    },

    backup: {
      async exportBytes(options) {
        return data.backup.create(options);
      },
      async inspect(bytes) {
        return data.backup.inspect(bytes);
      },
      async restore(bytes, options) {
        return data.backup.restore(bytes, options);
      },
    },

    passwords: {
      async getAll() {
        return data.passwords.getAll();
      },
      async create(name, value, profileIds) {
        return data.passwords.create(name, value, profileIds);
      },
      async update(id, updates) {
        return data.passwords.update(id, updates);
      },
      async delete(id) {
        return data.passwords.delete(id);
      },
      async getDecryptedForProfile(profileId) {
        return data.passwords.getDecryptedForProfile(profileId);
      },
      async getDecryptedById(id) {
        return data.passwords.getDecryptedById(id);
      },
    },

    mails: {
      async getAll() {
        return data.mails.getAll();
      },
      async create(email, profileIds) {
        return data.mails.create(email, profileIds);
      },
      async update(id, updates) {
        return data.mails.update(id, updates);
      },
      async delete(id) {
        return data.mails.delete(id);
      },
    },
  };
}
