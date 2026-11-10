/**
 * Composición de los servicios de datos de desktop: el core con los adaptadores de Node.
 * No depende del lanzador, así que cualquiera puede importarlo sin ciclos.
 */

import * as path from 'path';
import { app } from 'electron';
import { v4 as uuid } from 'uuid';
import { CoreDeps, createDataServices } from '@xpm/core';
import { NodeDocumentStore } from './adapters/nodeDocumentStore';
import { NodeProfileData } from './adapters/nodeProfileData';
import { NodeAssetStore } from './adapters/nodeAssetStore';
import { AdmZipCodec } from './adapters/admZipCodec';
import { NodeSecretCipher } from './adapters/nodeSecretCipher';
import { buildDesktopDefaultSettings } from './adapters/desktopDefaults';

const userDataDir = app.getPath('userData');
const appDataDir = path.join(userDataDir, 'x-profiles-manager');

export const coreDeps: CoreDeps = {
  documents: new NodeDocumentStore({
    profiles: path.join(appDataDir, 'profiles.json'),
    folders: path.join(appDataDir, 'folders.json'),
    settings: path.join(appDataDir, 'settings.json'),
    // These two live in userData directly (not in the app subfolder): keep the existing locations
    passwords: path.join(userDataDir, 'passwords.json'),
    mails: path.join(userDataDir, 'mails.json'),
  }),
  profileData: new NodeProfileData(),
  assets: new NodeAssetStore(path.join(appDataDir, 'icons')),
  archive: new AdmZipCodec(),
  cipher: new NodeSecretCipher(),
  defaultSettings: () => buildDesktopDefaultSettings(appDataDir),
  newId: () => uuid(),
  now: () => Date.now(),
};

export const data = createDataServices(coreDeps);
