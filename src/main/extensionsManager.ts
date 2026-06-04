/**
 * Extensions Manager - Handle Chrome extension detection
 * Extensions are opened in the Web Store on first launch, then auto-installed
 */

import * as path from 'path';
import * as fs from 'fs';

// Extension IDs and metadata
export const EXTENSIONS = {
  ublockOriginLite: {
    id: 'ddkjiahejlhfcafbddmgiahcphecmpfh',
    name: 'uBlock Origin Lite',
    url: 'https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh',
  },
  twitterControl: {
    id: 'kpmjjdhbcfebfjgdnpjagcndoelnidfj',
    name: 'Control Panel for Twitter',
    url: 'https://chromewebstore.google.com/detail/control-panel-for-twitter/kpmjjdhbcfebfjgdnpjagcndoelnidfj',
  },
};

type ExtensionKey = keyof typeof EXTENSIONS;

/**
 * Check if an extension is installed in a Chrome profile
 */
export function isExtensionInstalled(profileDataDir: string, extensionKey: ExtensionKey): boolean {
  const extensionId = EXTENSIONS[extensionKey].id;
  const extensionPath = path.join(
    profileDataDir,
    'Extensions',
    extensionId
  );
  
  try {
    return fs.existsSync(extensionPath) && fs.statSync(extensionPath).isDirectory();
  } catch (error) {
    console.error(`Error checking extension ${extensionKey}:`, error);
    return false;
  }
}

/**
 * Detect all installed extensions in a profile
 */
export function detectInstalledExtensions(profileDataDir: string): Record<ExtensionKey, boolean> {
  return {
    ublockOriginLite: isExtensionInstalled(profileDataDir, 'ublockOriginLite'),
    twitterControl: isExtensionInstalled(profileDataDir, 'twitterControl'),
  };
}

/**
 * Get extension URLs to open for a profile that needs installation
 * Returns array of URLs for extensions that need to be installed
 */
export function getExtensionUrlsToOpen(profileDataDir: string, extensionsConfig: any): string[] {
  const urls: string[] = [];
  
  if (!extensionsConfig) {
    return urls;
  }
  
  // Check uBlock Origin Lite
  if (extensionsConfig.ublockOriginLite && !isExtensionInstalled(profileDataDir, 'ublockOriginLite')) {
    urls.push(EXTENSIONS.ublockOriginLite.url);
  }
  
  // Check Control Panel for Twitter
  if (extensionsConfig.twitterControl && !isExtensionInstalled(profileDataDir, 'twitterControl')) {
    urls.push(EXTENSIONS.twitterControl.url);
  }
  
  return urls;
}
