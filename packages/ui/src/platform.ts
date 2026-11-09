/**
 * Punto único de acceso a la plataforma (Electron en desktop, Capacitor en Android).
 * La plataforma expone su implementación en `window.platformAPI` antes de montar React.
 */

import type { PlatformAPI } from '@xpm/core';

export const getPlatformAPI = (): PlatformAPI => {
  if (typeof window === 'undefined') {
    throw new Error('getPlatformAPI must be used in the browser');
  }

  if (!window.platformAPI) {
    throw new Error(
      'window.platformAPI is not available. Make sure the host platform is loading the application correctly.'
    );
  }

  return window.platformAPI;
};
