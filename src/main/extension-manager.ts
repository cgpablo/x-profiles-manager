/**
 * ExtensionManager - Downloads and loads browser extensions into embedded sessions.
 *
 * Extensions managed:
 *  - uBlock Origin Lite (MV3 ad/tracker blocker)
 *  - Control Panel for Twitter (MV3 X/Twitter UI enhancer)
 *
 * Each extension is downloaded once to userData from its GitHub releases,
 * extracted, and loaded into every new embedded session via session.loadExtension().
 * Extensions must be reloaded on each app launch (Electron does not persist them).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { app, session as electronSession } from 'electron';
import AdmZip from 'adm-zip';

interface ExtensionSpec {
  /** Unique directory name under userData/extensions/ */
  dirName: string;
  /** GitHub API endpoint for latest release */
  apiUrl: string;
  /** Picks the right asset from the release assets array */
  assetFilter: (name: string) => boolean;
  /**
   * Optional post-install patch applied to the extracted manifest.json.
   * Useful to strip background scripts that use unsupported Chrome APIs in Electron.
   */
  patchManifest?: (manifest: Record<string, any>) => Record<string, any>;
}

const EXTENSIONS: ExtensionSpec[] = [
  {
    dirName: 'ublock-origin-lite',
    apiUrl: 'https://api.github.com/repos/uBlockOrigin/uBOL-home/releases/latest',
    assetFilter: (name) => name.includes('chromium') && name.endsWith('.zip'),
  },
  {
    dirName: 'control-panel-for-twitter',
    apiUrl: 'https://api.github.com/repos/insin/control-panel-for-twitter/releases/latest',
    assetFilter: (name) => name.includes('mv2') && name.endsWith('.zip'),
    // Electron doesn't support chrome.tabs.onRemoved in extension service workers.
    // Strip the background script entirely — content scripts still work fine.
    patchManifest: (manifest) => {
      const patched = { ...manifest };
      delete patched.background;
      delete patched.service_worker;
      console.log('[ExtensionManager] Patched control-panel-for-twitter: removed background/service_worker');
      return patched;
    },
  },
];

export class ExtensionManager {
  private extBaseDir: string;
  /** Sessions that already have all extensions loaded in this process lifetime */
  private loadedSessions = new Set<string>();
  /** Sessions currently being loaded — prevents concurrent double-load */
  private loadingSession = new Set<string>();
  /** One install promise per extension dir — prevents parallel downloads */
  private installPromises = new Map<string, Promise<void>>();

  constructor() {
    this.extBaseDir = path.join(app.getPath('userData'), 'extensions');
  }

  private extDir(dirName: string): string {
    return path.join(this.extBaseDir, dirName);
  }

  private isInstalled(spec: ExtensionSpec): boolean {
    const manifestPath = path.join(this.extDir(spec.dirName), 'manifest.json');
    if (!fs.existsSync(manifestPath)) return false;

    // If a patch is defined, ensure it has been applied (idempotent check)
    if (spec.patchManifest) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        // If background or service_worker still present, re-patch
        if (manifest.background || manifest.service_worker) {
          const patched = spec.patchManifest(manifest);
          fs.writeFileSync(manifestPath, JSON.stringify(patched, null, 2), 'utf-8');
        }
      } catch {}
    }
    return true;
  }

  /** Fetches JSON from a URL, following redirects. */
  private fetchJSON(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const follow = (u: string) => {
        https
          .get(u, { headers: { 'User-Agent': 'x-profiles-manager' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
              const loc = res.headers.location;
              if (!loc) return reject(new Error('Redirect without Location'));
              res.resume();
              return follow(loc);
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`HTTP ${res.statusCode} fetching ${u}`));
            }
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
          })
          .on('error', reject);
      };
      follow(url);
    });
  }

  /** Downloads a binary file, following redirects. */
  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const follow = (u: string) => {
        https
          .get(u, { headers: { 'User-Agent': 'x-profiles-manager' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
              const loc = res.headers.location;
              if (!loc) return reject(new Error('Redirect without Location'));
              res.resume();
              return follow(loc);
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`HTTP ${res.statusCode} downloading from ${u}`));
            }
            const file = fs.createWriteStream(destPath);
            res.pipe(file);
            file.on('finish', () => file.close(() => resolve()));
            file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
          })
          .on('error', reject);
      };
      follow(url);
    });
  }

  private async getAssetUrl(spec: ExtensionSpec): Promise<string> {
    const release = await this.fetchJSON(spec.apiUrl);
    const asset = (release.assets as any[]).find((a: any) => spec.assetFilter(a.name));
    if (!asset) throw new Error(`No matching asset in latest release for ${spec.dirName}`);
    return asset.browser_download_url as string;
  }

  private async installExtension(spec: ExtensionSpec): Promise<void> {
    const tmpZip = path.join(this.extBaseDir, `${spec.dirName}-tmp.zip`);
    const targetDir = this.extDir(spec.dirName);

    fs.mkdirSync(this.extBaseDir, { recursive: true });

    console.log(`[ExtensionManager] Resolving ${spec.dirName}…`);
    const zipUrl = await this.getAssetUrl(spec);
    console.log(`[ExtensionManager] Downloading ${spec.dirName}:`, zipUrl);
    await this.downloadFile(zipUrl, tmpZip);

    console.log(`[ExtensionManager] Extracting ${spec.dirName}…`);
    const zip = new AdmZip(tmpZip);
    const tmpExtDir = targetDir + '_tmp';
    if (fs.existsSync(tmpExtDir)) fs.rmSync(tmpExtDir, { recursive: true });
    zip.extractAllTo(tmpExtDir, true);

    // Normalise: unwrap single top-level subdirectory if present
    const entries = fs.readdirSync(tmpExtDir);
    let sourceDir = tmpExtDir;
    if (entries.length === 1) {
      const candidate = path.join(tmpExtDir, entries[0]);
      if (fs.statSync(candidate).isDirectory()) sourceDir = candidate;
    }

    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true });
    fs.renameSync(sourceDir, targetDir);
    if (fs.existsSync(tmpExtDir)) fs.rmSync(tmpExtDir, { recursive: true });
    fs.unlink(tmpZip, () => {});

    // Apply manifest patch if specified
    if (spec.patchManifest) {
      const manifestPath = path.join(targetDir, 'manifest.json');
      const original = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const patched = spec.patchManifest(original);
      fs.writeFileSync(manifestPath, JSON.stringify(patched, null, 2), 'utf-8');
    }

    console.log(`[ExtensionManager] ${spec.dirName} installed at`, targetDir);
  }

  /**
   * Ensures all extensions are downloaded. Safe to call concurrently.
   */
  async ensureInstalled(): Promise<void> {
    await Promise.all(
      EXTENSIONS.map((spec) => {
        if (this.isInstalled(spec)) return Promise.resolve();
        if (!this.installPromises.has(spec.dirName)) {
          const p = this.installExtension(spec).finally(() =>
            this.installPromises.delete(spec.dirName)
          );
          this.installPromises.set(spec.dirName, p);
        }
        return this.installPromises.get(spec.dirName)!;
      })
    );
  }

  /**
   * Installs enabled extensions and removes disabled ones from disk.
   * Call this instead of ensureInstalled() so disabled extensions are cleaned up.
   */
  async syncInstalled(enabledDirNames: string[]): Promise<void> {
    // Remove disabled extensions from disk
    for (const spec of EXTENSIONS) {
      if (!enabledDirNames.includes(spec.dirName)) {
        const dir = this.extDir(spec.dirName);
        if (fs.existsSync(dir)) {
          console.log(`[ExtensionManager] Removing disabled extension: ${spec.dirName}`);
          fs.rmSync(dir, { recursive: true });
        }
      }
    }

    // Install only the enabled ones
    await Promise.all(
      EXTENSIONS
        .filter(spec => enabledDirNames.includes(spec.dirName))
        .map((spec) => {
          if (this.isInstalled(spec)) return Promise.resolve();
          if (!this.installPromises.has(spec.dirName)) {
            const p = this.installExtension(spec).finally(() =>
              this.installPromises.delete(spec.dirName)
            );
            this.installPromises.set(spec.dirName, p);
          }
          return this.installPromises.get(spec.dirName)!;
        })
    );
  }

  /** Removes a single extension from disk (for cleanup when disabled). */
  removeExtension(dirName: string): void {
    const dir = this.extDir(dirName);
    if (fs.existsSync(dir)) {
      console.log(`[ExtensionManager] Deleting extension files: ${dirName}`);
      fs.rmSync(dir, { recursive: true });
    }
  }

  /**
   * Loads extensions into a session partition, filtered by enabledDirNames.
   * No-ops if already loaded in this process run.
   */
  async loadIntoSession(partition: string, enabledDirNames?: string[]): Promise<void> {
    if (this.loadedSessions.has(partition) || this.loadingSession.has(partition)) return;
    this.loadingSession.add(partition);

    const sess = electronSession.fromPartition(partition);

    await Promise.all(
      EXTENSIONS
        .filter(spec => !enabledDirNames || enabledDirNames.includes(spec.dirName))
        .map(async (spec) => {
          const dir = this.extDir(spec.dirName);
          if (!fs.existsSync(path.join(dir, 'manifest.json'))) {
            console.warn(`[ExtensionManager] ${spec.dirName} not installed, skipping`);
            return;
          }
          try {
            await sess.loadExtension(dir, { allowFileAccess: true });
            console.log(`[ExtensionManager] ${spec.dirName} loaded into ${partition}`);
          } catch (err) {
            console.warn(`[ExtensionManager] Failed to load ${spec.dirName}:`, err);
          }
        })
    );

    this.loadedSessions.add(partition);
    this.loadingSession.delete(partition);
  }
}

export const extensionManager = new ExtensionManager();
