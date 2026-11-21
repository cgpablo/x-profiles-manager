import { registerPlugin } from '@capacitor/core';

interface NativeThemePlugin {
  setTheme(options: { theme: string }): Promise<void>;
}

const NativeTheme = registerPlugin<NativeThemePlugin>('NativeTheme');

/** Envía al lado nativo el tema resuelto (light | dark | dim): barras del sistema y navegador de perfiles. */
export function syncNativeTheme(): void {
  const sync = () => {
    const theme = document.documentElement.dataset.theme;
    if (!theme) return;
    NativeTheme.setTheme({ theme }).catch((error) => console.error('setTheme failed', error));
  };
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  sync();
}
