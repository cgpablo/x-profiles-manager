import { UserFacingError } from '@xpm/core';
import type { BrowserLauncher } from '@xpm/core';

/**
 * Lanzador provisional de M4: todavía no hay navegador en Android.
 * M5 lo sustituye por el plugin nativo con GeckoView.
 */
export class UnavailableLauncher implements BrowserLauncher {
  async launch(): Promise<never> {
    throw new UserFacingError('El navegador de Android todavía no está disponible');
  }
  close = () => false;
  isActive = () => false;
  getActive = (): string[] => [];
  focusWindow = async () => false;
  autoLogin = async () => false;
  isLoggedIn = async () => false;
  isOnHomeUrl = async () => false;
  fillPinRecovery = async () => false;
  openChat = async () => false;
}
