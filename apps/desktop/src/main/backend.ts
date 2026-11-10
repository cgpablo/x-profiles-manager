/**
 * Backend de desktop: la lógica del core conectada al lanzador de Chromium/Gecko.
 */

import { createBackend } from '@xpm/core';
import { coreDeps, data } from './storageServices';
import { desktopLauncher } from './desktopLauncher';

export const backend = createBackend(data, desktopLauncher, coreDeps);
