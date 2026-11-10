/**
 * Arranque de la app móvil: prepara el core con los adaptadores de Android, expone
 * `window.platformAPI` y, solo entonces, monta la UI (que lo necesita desde el primer render).
 */

import './safe-area.css';
import './touch.css';
import { createBackend, createDataServices } from '@xpm/core';
import type { CoreDeps } from '@xpm/core';
import { disableKeyboardSuggestions } from './platform/noSuggestions';
import { installBackButton } from './platform/backButton';
import { FflateArchive } from './platform/archive';
import { CapacitorAssetStore } from './platform/assetStore';
import { NobleSecretCipher } from './platform/cipher';
import { mobileDefaultSettings } from './platform/defaults';
import { CapacitorDocumentStore } from './platform/documentStore';
import { MobileFiles } from './platform/files';
import { AndroidLauncher } from './platform/androidLauncher';
import { createMobilePlatformApi } from './platform/platformApi';
import { NoProfileData } from './platform/profileData';

async function boot(): Promise<void> {
  const documents = await CapacitorDocumentStore.open();

  const deps: CoreDeps = {
    documents,
    profileData: new NoProfileData(),
    assets: new CapacitorAssetStore(),
    archive: new FflateArchive(),
    cipher: new NobleSecretCipher(),
    defaultSettings: mobileDefaultSettings,
    newId: () => crypto.randomUUID(),
    now: () => Date.now(),
  };

  const data = createDataServices(deps);
  const launcher = new AndroidLauncher(
    (profileId) => data.profiles.get(profileId) !== null,
    (profileId) => {
      const profile = data.profiles.get(profileId);
      const account = profile?.xAccount;
      const password = account ? data.passwords.getDecryptedForProfile(profileId) : null;
      const pin = profile?.pinPasswordId ? data.passwords.getDecryptedById(profile.pinPasswordId) : null;
      return {
        ...(account && password ? { username: account.replace(/^@/, ''), password } : {}),
        ...(pin ? { pin } : {}),
      };
    },
    () => ({ profiles: data.profiles.getAll(), folders: data.folders.getAll() })
  );
  launcher.loadProfiles(data.profiles.getAll());
  const backend = createBackend(data, launcher, deps);
  window.platformAPI = createMobilePlatformApi(backend, new MobileFiles());

  await import('@xpm/ui/main');
}

installBackButton();
disableKeyboardSuggestions();

boot().catch((error) => {
  console.error('Boot failed', error);
  document.body.innerText = `Error al arrancar: ${error instanceof Error ? error.message : String(error)}`;
});
