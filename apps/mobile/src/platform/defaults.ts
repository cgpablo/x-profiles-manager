import type { AppSettings } from '@xpm/core';

/** Ajustes por defecto en Android: el motor es Gecko (GeckoView) y no hay rutas de navegador. */
export function mobileDefaultSettings(): AppSettings {
  return {
    browserEngine: 'gecko',
    chromePath: '',
    geckoPath: '',
    profilesDir: '',
    windowLayout: 'floating',
    autoLaunchOnStartup: false,
    backupIcons: false,
  };
}
