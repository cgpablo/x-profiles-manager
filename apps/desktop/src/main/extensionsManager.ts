/**
 * Extensions Manager - Handle browser extension detection across engines
 * Supports Chromium (Chrome, Brave, Edge) and Gecko (Firefox, Zen, LibreWolf)
 */

import * as path from 'path';
import * as fs from 'fs';
import { BrowserEngine } from '@xpm/core';

// Extension metadata per engine
export const EXTENSIONS = {
  ublockOriginLite: {
    name: 'uBlock Origin Lite',
    chromium: {
      id: 'ddkjiahejlhfcafbddmgiahcphecmpfh',
      url: 'https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh',
    },
    gecko: {
      id: 'uBlock0@raymondhill.net',
      url: 'https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/',
    },
  },
  twitterControl: {
    name: 'Control Panel for Twitter',
    chromium: {
      id: 'kpmjjdhbcfebfjgdnpjagcndoelnidfj',
      url: 'https://chromewebstore.google.com/detail/control-panel-for-twitter/kpmjjdhbcfebfjgdnpjagcndoelnidfj',
    },
    gecko: {
      id: '{5cce4ab5-3d47-41b9-af5e-8203eea05245}',
      url: 'https://addons.mozilla.org/en-US/firefox/addon/control-panel-for-twitter/',
    },
  },
};

export type ExtensionKey = keyof typeof EXTENSIONS;

/**
 * Check if an extension is installed in a browser profile
 */
export function isExtensionInstalled(profileDataDir: string, extensionKey: ExtensionKey, engine: BrowserEngine): boolean {
  const ext = EXTENSIONS[extensionKey][engine];
  if (!ext) return false;

  try {
    if (engine === 'chromium') {
      // Chromium stores extensions in <userDataDir>/Default/Extensions/<id>/
      // ("Default" is the profile Chrome creates inside the user-data-dir)
      const extensionPath = path.join(profileDataDir, 'Default', 'Extensions', ext.id);
      return fs.existsSync(extensionPath) && fs.statSync(extensionPath).isDirectory();
    } else {
      // Gecko stores extensions in <profileDir>/extensions/<id>.xpi or <id>/ directory
      const extensionsDir = path.join(profileDataDir, 'extensions');
      if (!fs.existsSync(extensionsDir)) return false;

      const xpiPath = path.join(extensionsDir, `${ext.id}.xpi`);
      const dirPath = path.join(extensionsDir, ext.id);
      return fs.existsSync(xpiPath) || (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory());
    }
  } catch (error) {
    console.error(`Error checking extension ${extensionKey}:`, error);
    return false;
  }
}

/**
 * Detect all installed extensions in a profile
 */
export function detectInstalledExtensions(profileDataDir: string, engine: BrowserEngine): Record<ExtensionKey, boolean> {
  return {
    ublockOriginLite: isExtensionInstalled(profileDataDir, 'ublockOriginLite', engine),
    twitterControl: isExtensionInstalled(profileDataDir, 'twitterControl', engine),
  };
}

/**
 * Get extension URLs to open for a profile that needs installation.
 * Returns array of store URLs for extensions not yet installed.
 */
export function getExtensionUrlsToOpen(profileDataDir: string, extensionsConfig: any, engine: BrowserEngine): string[] {
  const urls: string[] = [];

  if (!extensionsConfig) {
    return urls;
  }

  for (const [key, config] of Object.entries(extensionsConfig)) {
    if (config && key in EXTENSIONS) {
      const extKey = key as ExtensionKey;
      if (!isExtensionInstalled(profileDataDir, extKey, engine)) {
        urls.push(EXTENSIONS[extKey][engine].url);
      }
    }
  }

  return urls;
}
