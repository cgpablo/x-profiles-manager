import { BrowserLauncher } from '@xpm/core';
import { chromeLauncher } from './launcher';

/** Conecta el lanzador de Chromium/Gecko de desktop con el puerto `BrowserLauncher` del core. */
export const desktopLauncher: BrowserLauncher = {
  launch: (profileId, url) => chromeLauncher.launchProfile(profileId, url),
  close: (profileId) => chromeLauncher.closeProfile(profileId),
  isActive: (profileId) => chromeLauncher.getProfileStatus(profileId),
  getActive: () => chromeLauncher.getActiveProfiles(),
  focusWindow: (profileId) => chromeLauncher.focusWindow(profileId),
  autoLogin: (profileId, username, password) => chromeLauncher.autoLogin(profileId, username, password),
  isLoggedIn: (profileId) => chromeLauncher.isLoggedIn(profileId),
  isOnHomeUrl: (profileId) => chromeLauncher.isOnHomeUrl(profileId),
  fillPinRecovery: (profileId, pin) => chromeLauncher.fillPinRecovery(profileId, pin),
  openChat: (profileId) => chromeLauncher.openChat(profileId),
  openUrl: (profileId, url) => chromeLauncher.openUrl(profileId, url),
  openThread: (profileId, texts, images) => chromeLauncher.openThread(profileId, texts, images),
  openQuote: (profileId, tweetId, text, images) => chromeLauncher.openQuote(profileId, tweetId, text, images),
  openReply: (profileId, tweetId, text, images) => chromeLauncher.openReply(profileId, tweetId, text, images),

  profileSaved: (profile) => chromeLauncher.updateProfileMetadata(profile.id, profile),
  profileDeleted: (profileId) => chromeLauncher.deleteProfileMetadata(profileId),
  afterLaunch: (profile, settings) => chromeLauncher.openExtensionsIfNeeded(profile, settings),
};
