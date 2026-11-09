import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

interface ProfileInfo {
  profileId: string;
  name?: string;
  color?: string;
}

/** Plugin propio (Kotlin: ProfileBrowserPlugin.kt): el navegador GeckoView de Android. */
export interface ProfileBrowserPlugin {
  launch(options: ProfileInfo & { url?: string }): Promise<{ startTime: number }>;
  focus(options: { profileId: string }): Promise<{ focused: boolean }>;
  close(options: { profileId: string }): Promise<{ closed: boolean }>;
  closeAll(): Promise<{ count: number }>;
  getActive(): Promise<{ profileIds: string[] }>;
  updateProfile(options: ProfileInfo): Promise<void>;
  isLoggedIn(options: { profileId: string }): Promise<{ value: boolean }>;
  isOnHomeUrl(options: { profileId: string }): Promise<{ value: boolean }>;
  openChat(options: ProfileInfo): Promise<{ value: boolean }>;
  fillPinRecovery(options: ProfileInfo & { pin?: string }): Promise<{ value: boolean }>;
  autoLogin(options: ProfileInfo & { username: string; password: string }): Promise<{ value: boolean }>;
  addListener(
    eventName: 'sessionsChanged',
    listener: (event: { profileIds: string[] }) => void
  ): Promise<PluginListenerHandle>;
}

export const ProfileBrowser = registerPlugin<ProfileBrowserPlugin>('ProfileBrowser');
