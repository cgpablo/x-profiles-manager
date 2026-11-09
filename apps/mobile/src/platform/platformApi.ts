import { UserFacingError } from '@xpm/core';
import type { Backend, PlatformAPI, PlatformCapabilities } from '@xpm/core';
import type { MobileFiles } from './files';

const capabilities: PlatformCapabilities = {
  browserPaths: false,
  profilesDir: false,
  windowManagement: false,
  openDirectory: false,
  perProfileExtensions: false,
  autoLaunchOnStartup: false,
};

/**
 * Convierte los resultados del Backend al contrato de PlatformAPI con las MISMAS reglas que el
 * ipc de desktop, para que la UI se comporte igual: errores como `Error`, `false` en
 * operaciones booleanas como fallo, y `null` en búsquedas como "no encontrado".
 */
const toError = (error: unknown): Error =>
  error instanceof UserFacingError ? new Error(error.message) : new Error(String(error));

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toError(error);
  }
}

const bool = (fn: () => Promise<boolean>) =>
  call(async () => {
    const ok = await fn();
    if (!ok) throw new UserFacingError('Unknown error from main process');
    return ok;
  });

const found = <T>(notFound: string, fn: () => Promise<T | null>) =>
  call(async () => {
    const result = await fn();
    if (result === null) throw new UserFacingError(notFound);
    return result;
  });

/** Un zip recortado o dañado hace que fflate falle con mensajes técnicos: se explica mejor. */
const friendlyBackupError = (error: unknown): unknown => {
  const message = error instanceof Error ? error.message : String(error);
  return /invalid zip|unexpected EOF|invalid (block|distance|length)/i.test(message)
    ? new UserFacingError(
        'El fichero no es un backup válido o está incompleto. Si lo has copiado con un cable (adb) o desde otro equipo, ' +
          'cámbiale el nombre y vuelve a intentarlo.'
      )
    : error;
};

const unsupported = (what: string) => () => Promise.reject(new Error(`${what} no está disponible en Android`));

const dateStamp = () => new Date().toISOString().split('T')[0];

export function createMobilePlatformApi(backend: Backend, files: MobileFiles): PlatformAPI {
  return {
    platform: 'android',
    capabilities,

    profiles: {
      getAll: () => call(() => backend.profiles.getAll()),
      create: (name, color, icon, xAccount, folderId, directoryPath) =>
        call(() => backend.profiles.create(name, color, icon, xAccount, folderId, directoryPath)),
      update: (profileId, updates) => found('Profile not found', () => backend.profiles.update(profileId, updates)),
      delete: (profileId) => bool(() => backend.profiles.delete(profileId)),
      saveOrder: (profileIds) => call(() => backend.profiles.saveOrder(profileIds)),
    },

    launcher: {
      launch: (profileId, url) => call(() => backend.launcher.launch(profileId, url)),
      close: (profileId) => bool(() => backend.launcher.close(profileId)),
      closeAll: () => call(() => backend.launcher.closeAll()),
      focusWindow: (profileId) => call(() => backend.launcher.focusWindow(profileId)),
      getActive: () => call(() => backend.launcher.getActive()),
      isActive: (profileId) => call(() => backend.launcher.isActive(profileId)),
      autoLogin: (profileId) => call(() => backend.launcher.autoLogin(profileId)),
      isLoggedIn: (profileId) => call(() => backend.launcher.isLoggedIn(profileId)),
      isOnHomeUrl: (profileId) => call(() => backend.launcher.isOnHomeUrl(profileId)),
      fillPinRecovery: (profileId) => call(() => backend.launcher.fillPinRecovery(profileId)),
      openChat: (profileId) => call(() => backend.launcher.openChat(profileId)),
    },

    folders: {
      getAll: () => call(() => backend.folders.getAll()),
      create: (name, color, icon) => call(() => backend.folders.create(name, color, icon)),
      update: (folderId, updates) => call(() => backend.folders.update(folderId, updates)),
      delete: (folderId) => bool(() => backend.folders.delete(folderId)),
      saveOrder: (folderIds) => call(() => backend.folders.saveOrder(folderIds)),
    },

    settings: {
      get: () => call(() => backend.settings.get()),
      update: (updates) => call(() => backend.settings.update(updates)),
    },

    system: {
      getInfo: async () => ({ platform: 'android', arch: 'arm64', version: navigator.userAgent }),
      clearAllData: () => bool(() => backend.system.clearAllData()),
      selectFile: unsupported('Seleccionar un ejecutable'),
      selectDirectory: unsupported('Seleccionar un directorio'),
    },

    dialog: {
      openFile: (options) => call(() => files.pickFiles(options?.filters)),
      fileToDataUrl: (filePath) => call(() => files.toDataUrl(filePath)),
    },

    backup: {
      export: () =>
        call(async () => {
          const saved = await files.saveBackup(`x-profiles-backup-${dateStamp()}.zip`, await backend.backup.exportBytes());
          if (!saved) throw new UserFacingError('Export canceled');
          return true;
        }),
      exportSelected: (profileIds, options) =>
        call(async () => {
          if (!Array.isArray(profileIds) || profileIds.length === 0) {
            throw new UserFacingError('No profiles selected');
          }
          const bytes = await backend.backup.exportBytes({ ...options, profileIds });
          const saved = await files.saveBackup(`x-profiles-selected-${dateStamp()}.zip`, bytes);
          if (!saved) throw new UserFacingError('Export canceled');
          return true;
        }),
      import: () =>
        call(async () => {
          const picked = await files.pickBackup();
          if (!picked) throw new UserFacingError('Import canceled');
          try {
            return { filePath: picked.path, inspection: await backend.backup.inspect(picked.bytes) };
          } catch (error) {
            throw friendlyBackupError(error);
          }
        }),
      restore: (filePath, options) =>
        call(async () => {
          try {
            return await backend.backup.restore(await files.readBackup(filePath), options);
          } catch (error) {
            throw friendlyBackupError(error);
          }
        }),
    },

    icons: {
      backup: (filePath) => call(() => backend.icons.backup(filePath)),
      deleteAll: () => call(() => backend.icons.deleteAll()),
    },

    shell: {
      openExternal: (url) =>
        call(async () => {
          window.open(url, '_blank');
          return true;
        }),
      openPath: unsupported('Abrir una ruta'),
    },

    passwords: {
      getAll: () => call(() => backend.passwords.getAll()),
      create: (name, value, profileIds) => call(() => backend.passwords.create(name, value, profileIds)),
      update: (id, updates) => found('Entry not found', () => backend.passwords.update(id, updates)),
      delete: (id) => bool(() => backend.passwords.delete(id)),
      getDecryptedForProfile: (profileId) => call(() => backend.passwords.getDecryptedForProfile(profileId)),
      getDecryptedById: (id) => call(() => backend.passwords.getDecryptedById(id)),
    },

    mails: {
      getAll: () => call(() => backend.mails.getAll()),
      create: (email, profileIds) => call(() => backend.mails.create(email, profileIds)),
      update: (id, updates) => found('Entry not found', () => backend.mails.update(id, updates)),
      delete: (id) => bool(() => backend.mails.delete(id)),
    },
  };
}
