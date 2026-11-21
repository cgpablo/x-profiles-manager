/**
 * Tema de la app. La preferencia (`system | light | dark | dim`) se guarda en los ajustes; aquí se resuelve y se
 * aplica como `data-theme` en <html>. Además se cachea en localStorage para pintar bien desde el primer frame.
 */

import type { ThemePreference } from '@xpm/core';

export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const DEFAULT_THEME: ThemePreference = 'dim';

export const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'dim', label: 'Dim' },
];

const STORAGE_KEY = 'xpm-theme';
const LIGHT_QUERY = '(prefers-color-scheme: light)';

let current: ThemePreference = DEFAULT_THEME;
let mediaListening = false;

export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark' || value === 'dim';

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref !== 'system') return pref;
  return window.matchMedia?.(LIGHT_QUERY).matches ? 'light' : 'dark';
}

function paint(): void {
  document.documentElement.dataset.theme = resolve(current);
}

/** Aplica la preferencia. Con `system` sigue los cambios del sistema mientras esté activa. */
export function applyTheme(pref: ThemePreference | undefined): void {
  current = isThemePreference(pref) ? pref : DEFAULT_THEME;
  try {
    localStorage.setItem(STORAGE_KEY, current);
  } catch {
    // Sin almacenamiento: el tema se aplica igual, solo no se recuerda para el primer frame
  }
  if (!mediaListening && window.matchMedia) {
    mediaListening = true;
    window.matchMedia(LIGHT_QUERY).addEventListener('change', () => {
      if (current === 'system') paint();
    });
  }
  paint();
}

/** Antes del primer render: usa la última preferencia conocida para evitar un parpadeo con el tema equivocado. */
export function initTheme(): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // ignorar
  }
  applyTheme(isThemePreference(stored) ? stored : DEFAULT_THEME);
}
