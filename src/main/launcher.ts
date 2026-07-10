/**
 * Browser Launcher - Abre un navegador (Chromium o Gecko) con un perfil específico
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { storageManager } from './storage';
import { ProcessInfo, BrowserProfile, BrowserEngine } from '../types';

export class ChromeLauncher {
  private runningProcesses: Map<string, ProcessInfo> = new Map();
  private browserWindowMap: Map<number, string> = new Map();
  private profileMetadataMap: Map<string, any> = new Map();
  private debugPorts: Map<string, number> = new Map();
  private win32Api: any = null; // koffi bindings, initialized once

  /**
   * Lazy-init koffi Win32 bindings. Koffi types/structs cannot be redefined,
   * so we cache them on the instance after the first call.
   */
  private getWin32Api(): any {
    if (this.win32Api) return this.win32Api;

    const koffi = require('koffi');
    const user32  = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');

    const WNDENUMPROC = koffi.proto('bool __stdcall WNDENUMPROC(void *hwnd, intptr_t lParam)');

    const PROCESSENTRY32 = koffi.struct('PROCESSENTRY32', {
      dwSize:              'uint32_t',
      cntUsage:            'uint32_t',
      th32ProcessID:       'uint32_t',
      th32DefaultHeapID:   'uintptr_t',
      th32ModuleID:        'uint32_t',
      cntThreads:          'uint32_t',
      th32ParentProcessID: 'uint32_t',
      pcPriClassBase:      'int32_t',
      dwFlags:             'uint32_t',
      szExeFile:           koffi.array('char', 260),
    });

    this.win32Api = {
      koffi,
      WNDENUMPROC,
      PROCESSENTRY32,
      EnumWindows:              user32.func('bool EnumWindows(WNDENUMPROC *fn, intptr_t lParam)'),
      IsWindowVisible:          user32.func('bool IsWindowVisible(void *hWnd)'),
      GetWindowTextLengthW:     user32.func('int GetWindowTextLengthW(void *hWnd)'),
      GetWindowThreadProcessId: user32.func('uint32_t GetWindowThreadProcessId(void *hWnd, _Out_ uint32_t *lpdwProcessId)'),
      GetForegroundWindow:      user32.func('void *GetForegroundWindow()'),
      AttachThreadInput:        user32.func('bool AttachThreadInput(uint32_t idAttach, uint32_t idAttachTo, bool fAttach)'),
      SetForegroundWindow:      user32.func('bool SetForegroundWindow(void *hWnd)'),
      ShowWindow:               user32.func('bool ShowWindow(void *hWnd, int nCmdShow)'),
      BringWindowToTop:         user32.func('bool BringWindowToTop(void *hWnd)'),
      AllowSetForegroundWindow: user32.func('bool AllowSetForegroundWindow(uint32_t dwProcessId)'),
      GetCurrentThreadId:       kernel32.func('uint32_t GetCurrentThreadId()'),
      GetCurrentProcessId:      kernel32.func('uint32_t GetCurrentProcessId()'),
      CreateToolhelp32Snapshot: kernel32.func('void *CreateToolhelp32Snapshot(uint32_t dwFlags, uint32_t th32ProcessID)'),
      Process32First:           kernel32.func('bool Process32First(void *hSnapshot, _Inout_ PROCESSENTRY32 *lppe)'),
      Process32Next:            kernel32.func('bool Process32Next(void *hSnapshot, _Inout_ PROCESSENTRY32 *lppe)'),
      CloseHandle:              kernel32.func('bool CloseHandle(void *hObject)'),
    };

    return this.win32Api;
  }

  /**
   * Calcula un puerto de debugging único para un perfil
   */
  private getDebugPort(profileId: string): number {
    // Use hash of profileId to generate consistent debug port
    // Range: 9222-9322 (100 ports available)
    const hash = profileId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return 9222 + (hash % 100);
  }

  /**
   * Returns the active browser engine from settings
   */
  private getBrowserEngine(): BrowserEngine {
    return storageManager.getSettings().browserEngine || 'chromium';
  }

  /**
   * Returns the browser executable path based on current engine
   */
  private getBrowserPath(): string {
    const settings = storageManager.getSettings();
    if (settings.browserEngine === 'gecko') {
      return settings.geckoPath || '';
    }
    return settings.chromePath;
  }

  /**
   * Returns the process name pattern for pgrep/tasklist based on engine
   */
  private getBrowserProcessNames(): string[] {
    if (this.getBrowserEngine() === 'gecko') {
      return ['firefox', 'zen', 'librewolf', 'waterfox'];
    }
    return ['chrome', 'chromium', 'msedge'];
  }

  /**
   * Returns the macOS app name for AppleScript based on browser path
   */
  private getMacOSAppName(): string {
    const browserPath = this.getBrowserPath().toLowerCase();
    if (browserPath.includes('zen')) return 'Zen Browser';
    if (browserPath.includes('librewolf')) return 'LibreWolf';
    if (browserPath.includes('waterfox')) return 'Waterfox';
    if (browserPath.includes('firefox')) return 'Firefox';
    if (browserPath.includes('edge') || browserPath.includes('msedge')) return 'Microsoft Edge';
    if (browserPath.includes('chromium')) return 'Chromium';
    return 'Google Chrome';
  }

  /**
   * Returns the effective data directory for the current engine.
   * Each engine stores its data in a subdirectory: <dataDir>/chromium or <dataDir>/gecko
   */
  private getEffectiveDataDir(dataDir: string, engine?: BrowserEngine): string {
    const e = engine || this.getBrowserEngine();
    return path.join(dataDir, e);
  }

  /**
   * Returns the profile dir CLI arg pattern used in the running process.
   * Used for pgrep/pkill to identify profile-specific processes.
   * For gecko, we search just the effective dataDir path since Firefox may re-exec with -profile (single dash).
   */
  private getProfileDirPattern(dataDir: string): string {
    const effectiveDir = this.getEffectiveDataDir(dataDir);
    if (this.getBrowserEngine() === 'gecko') {
      return effectiveDir;
    }
    return 'user-data-dir=' + effectiveDir;
  }

  /**
   * Platform-specific: Close Chrome process on Windows
   */
  private closeProcessWindows(processInfo: ProcessInfo): void {
    const { execSync } = require('child_process');
    try {
      if (processInfo.pid && processInfo.pid > 0) {
        // Simply force kill Chrome - this will not show bubble
        // Chrome handles this gracefully without asking to restore
        try {
          execSync(`taskkill /PID ${processInfo.pid} /T /F`, {
            stdio: 'ignore',
            timeout: 5000,
          });
          console.log(`✓ Force killed Chrome process ${processInfo.pid}`);
        } catch (e) {
          console.warn(`Could not kill PID ${processInfo.pid}, trying by name...`);
          try {
            const exeName = this.getBrowserEngine() === 'gecko' ? 'firefox.exe' : 'chrome.exe';
            execSync(`taskkill /IM ${exeName} /F`, {
              stdio: 'ignore',
              timeout: 5000,
            });
            console.log(`✓ Force killed all Chrome processes`);
          } catch (e2) {
            console.error(`Failed to kill Chrome: ${e2}`);
          }
        }
      }
    } catch (error) {
      console.error(`Error in closeProcessWindows:`, error);
    }
  }

  /**
    * Platform-specific: Close Chrome process on macOS
    * Uses graceful shutdown first, then force kill if necessary
    */
  private closeProcessMacOS(processInfo: ProcessInfo, profile?: BrowserProfile): void {
    const { execSync } = require('child_process');
    if (processInfo.pid && processInfo.pid > 0) {
        try {
          // First try graceful close with AppleScript (simulates clicking the close button)
          console.log(`[macOS] Attempting graceful close for PID ${processInfo.pid}`);
          try {
            const appName = this.getMacOSAppName();
            const script = `tell application "${appName}" to close (every window)`;
          execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
            stdio: 'ignore',
            timeout: 3000,
          });
          // Wait a moment for graceful close to complete
          setTimeout(() => {
            try {
              process.kill(processInfo.pid, 0); // Check if process still exists
              // If it does, send SIGTERM
              console.log(`[macOS] Process still running, sending SIGTERM`);
              process.kill(processInfo.pid, 'SIGTERM');
            } catch {
              // Process is already dead
            }
          }, 500);
        } catch (e) {
          console.warn(`[macOS] AppleScript close failed, falling back to SIGTERM`);
          process.kill(processInfo.pid, 'SIGTERM');
        }
      } catch (e) {
        console.error(`[macOS] Error closing process:`, e);
      }
    }
    if (profile) {
      try {
        execSync(`pkill -f ${JSON.stringify(this.getProfileDirPattern(profile.dataDir))}`, { stdio: 'ignore' });
      } catch {}
    }
  }

  /**
   * Platform-specific: Close Chrome process on Linux
   */
  private closeProcessLinux(processInfo: ProcessInfo): void {
    try {
      process.kill(-processInfo.pid, 'SIGTERM');
    } catch (e) {
      console.warn(`Could not kill process group`, e);
    }
  }

  /**
   * Platform-specific: Check if profile process is running on Windows
   */
  private getProfileStatusWindows(processInfo: ProcessInfo): boolean {
    const { execSync } = require('child_process');
    try {
      const output = execSync(`tasklist /FI "PID eq ${processInfo.pid}" /NH`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const lines = output.trim().split('\n').filter((l: string) => l.trim().length > 0);
      const processNames = this.getBrowserProcessNames();
      if (lines.length > 0 && processNames.some(name => lines[0].toLowerCase().includes(name))) {
        return true;
      }
    } catch (error: any) {
      // fall through to command-line search
    }
    // For Gecko: PID may be stale if Firefox re-execed; search process list by profile dir
    if (this.getBrowserEngine() === 'gecko') {
      const profileId = Array.from(this.runningProcesses.entries())
        .find(([_, info]) => info.pid === processInfo.pid)?.[0];
      const profile = profileId ? storageManager.getProfile(profileId) : null;
      if (profile) {
        try {
          const dataDirEscaped = profile.dataDir.replace(/\\/g, '\\\\');
          const output = execSync(
            `wmic process where "CommandLine like '%${dataDirEscaped}%'" get ProcessId /format:csv`,
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000 }
          );
          return output.split('\n').filter((l: string) => /\d+/.test(l)).length > 0;
        } catch {
          return false;
        }
      }
    }
    return false;
  }

  /**
   * Platform-specific: Check if profile process is running on macOS
   */
  private getProfileStatusMacOS(processInfo: ProcessInfo, profile?: BrowserProfile): boolean {
    const { execSync } = require('child_process');
    if (!profile) return false;
    
    try {
      execSync(`pgrep -f ${JSON.stringify(this.getProfileDirPattern(profile.dataDir))}`, {
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Platform-specific: Check if profile process is running on Linux
   */
  private getProfileStatusLinux(processInfo: ProcessInfo): boolean {
    try {
      process.kill(processInfo.pid, 0);
      return true;
    } catch {
      // For Gecko: PID may be stale if Firefox re-execed; search by profile dir
      if (this.getBrowserEngine() === 'gecko') {
        const { execSync } = require('child_process');
        const profileId = Array.from(this.runningProcesses.entries())
          .find(([_, info]) => info.pid === processInfo.pid)?.[0];
        const profile = profileId ? storageManager.getProfile(profileId) : null;
        if (profile) {
          try {
            execSync(`pgrep -f ${JSON.stringify(profile.dataDir)}`, { stdio: 'ignore' });
            return true;
          } catch {
            return false;
          }
        }
      }
      return false;
    }
  }

  /**
   * Creates an HTML interstitial page that injects the xprofile into storage
   */
  private createInterstitialPage(profile: BrowserProfile): string {
    const xprofile = profile.xAccount || '';
    const username = xprofile.startsWith('@') ? xprofile.substring(1) : xprofile;
    
    // Escape properly for JSON string
    const escaped = JSON.stringify(username);
    
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Loading X...</title>
</head>
<body style="margin:0;padding:0;background:#fff;">
    <script type="text/javascript">
        (function() {
            try {
                var username = ${escaped};
                if (username && username.length > 0) {
                    localStorage.setItem("_xprofile_username", username);
                    sessionStorage.setItem("_xprofile_username", username);
                    console.log("[X Profiles Launcher] Stored xprofile:", username);
                }
            } catch(e) {
                console.error("[X Profiles Launcher] Error storing xprofile:", e);
            }
            
            // Redirect to X.com
            window.location.replace("https://x.com");
        })();
    </script>
    <p>Redirecting to X.com...</p>
</body>
</html>`;

    try {
      const htmlPath = path.join(profile.dataDir, 'xprofile-inject.html');
      fs.writeFileSync(htmlPath, html, 'utf8');
      return `file://${htmlPath}`;
    } catch (error) {
      console.error('Error creating interstitial page:', error);
      return 'https://x.com';
    }
  }

  /**
   * Lanza el navegador con un perfil específico
   */
  async launchProfile(profileId: string, url: string = 'https://x.com'): Promise<ProcessInfo | null> {
    const profile = storageManager.getProfile(profileId);
    if (!profile) return null;

    const settings = storageManager.getSettings();
    const engine = settings.browserEngine || 'chromium';

    // If already running, return existing process info
    if (this.runningProcesses.has(profileId)) {
      console.log(`Profile ${profileId} already running`);
      return this.runningProcesses.get(profileId) || null;
    }

    try {
      const browserPath = this.getBrowserPath();

      // Check if browser exists
      if (!browserPath) {
        throw new Error(engine === 'gecko' ? 'Firefox/Zen path not configured' : 'Chrome path not configured');
      }

      // Compute effective data dir (engine subdirectory)
      const effectiveDir = this.getEffectiveDataDir(profile.dataDir, engine);

      // Ensure the engine subdirectory exists
      if (!fs.existsSync(effectiveDir)) {
        fs.mkdirSync(effectiveDir, { recursive: true });
      }

      // Build CLI args based on engine
      let args: string[];

      if (engine === 'gecko') {
        args = [
          '--profile', effectiveDir,
          '--no-remote',
        ];
      } else {
        // Chromium engine
        const debugPort = this.getDebugPort(profileId);
        this.debugPorts.set(profileId, debugPort);

        args = [
          `--user-data-dir=${effectiveDir}`,
          `--no-first-run`,
          `--no-default-browser-check`,
          `--remote-debugging-port=${debugPort}`,
        ];

        // Platform-specific flags (Chromium only)
        if (process.platform === 'win32' || process.platform === 'linux') {
          args.push('--disable-session-crashed-bubble');
          args.push('--disable-session-restore');
        } else if (process.platform === 'darwin') {
          args.push('--disable-session-crashed-bubble');
          args.push('--disable-component-update');
          args.push('--no-service-autorun');
          args.push('--disable-session-restore');
          args.push('--disable-sync');
        }
      }

      // Build the URL - use interstitial page if xAccount is specified
      let finalUrl = url;
      if (profile.xAccount) {
        finalUrl = this.createInterstitialPage(profile);
      }
      args.push(finalUrl);

      // Extensions: open store pages for enabled-but-missing extensions as extra tabs
      try {
        const { getExtensionUrlsToOpen } = require('./extensionsManager');
        const extensionsConfig = settings.platformPreferences?.extensionsConfig;
        if (extensionsConfig) {
          const extUrls = getExtensionUrlsToOpen(effectiveDir, extensionsConfig, engine);
          if (extUrls.length > 0) {
            console.log(`Opening ${extUrls.length} extension store page(s) for profile ${profileId}`);
            args.push(...extUrls);
          }
        }
      } catch (error) {
        console.warn('Error checking extensions:', error);
      }

      let pid = 0;

      // Platform-specific launching
      if (process.platform === 'darwin') {
        // macOS: spawn browser binary directly so multiple profiles can run as separate instances.
        if (!fs.existsSync(browserPath)) {
          throw new Error(`Browser not found at ${browserPath}`);
        }
        
        const proc = spawn(browserPath, args, {
          detached: true,
          stdio: 'ignore',
        });
        pid = proc.pid || 0;
        proc.unref();
        
        // After launching, return focus to Electron app (don't let Chrome steal focus)
        const { execSync } = require('child_process');
        try {
          setTimeout(() => {
            const script = `tell application "System Events" to set frontmost of (processes whose bundle identifier is "com.xprofilesmanager.app") to true`;
            execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
              stdio: 'ignore',
            });
          }, 500); // Small delay to ensure Chrome launches first
        } catch (error) {
          console.error('Error returning focus to app:', error);
        }
       } else if (process.platform === 'win32') {
         // Windows
         if (!fs.existsSync(browserPath)) {
           throw new Error(`Browser not found at ${browserPath}`);
         }

         if (engine === 'chromium') {
           args.push('--disable-activate-on-launch');
         }

         const proc = spawn(browserPath, args, {
           detached: true,
           stdio: 'ignore',
           shell: false,
         });
         
         pid = proc.pid || 0;
         proc.unref();
      } else {
        // Linux and others
        if (!fs.existsSync(browserPath)) {
          throw new Error(`Browser not found at ${browserPath}`);
        }

        const proc = spawn(browserPath, args, {
          detached: true,
          stdio: 'ignore',
        });
        
        pid = proc.pid || 0;
        proc.unref();
      }

      const processInfo: ProcessInfo = {
        profileId,
        pid,
        startTime: Date.now(),
      };

       this.runningProcesses.set(profileId, processInfo);
       if (pid > 0) {
         this.browserWindowMap.set(pid, profileId);
       }

       return processInfo;
    } catch (error) {
      console.error(`Error launching profile ${profileId}:`, error);
      return null;
    }
  }

  /**
   * macOS: Enfoca ventana del navegador por PID Unix
   */
  private focusWindowMacOS(profileId: string, processInfo: ProcessInfo): boolean {
    const { execSync } = require('child_process');
    try {
      console.log(`[macOS Focus] Starting focus for profile ${profileId} (PID: ${processInfo.pid})`);

      // Resolve the actual live PID by searching for the profile dir in the process list.
      // The stored PID may be stale (Firefox re-execs itself after launch).
      let targetPid = processInfo.pid;
      const profile = storageManager.getProfile(profileId);
      if (profile) {
        try {
          const output = execSync(
            `pgrep -f ${JSON.stringify(this.getProfileDirPattern(profile.dataDir))}`,
            { encoding: 'utf8', timeout: 3000 }
          );
          const pids = output.trim().split('\n').map((l: string) => parseInt(l, 10)).filter((n: number) => !isNaN(n));
          if (pids.length > 0) {
            targetPid = pids[0]; // Parent process is typically the lowest/first PID
          }
        } catch {
          // pgrep found nothing; fall back to stored PID
        }
      }

      // Focus the window by unix PID (no `open -a` — that could launch the default browser instance)
      const script = `tell application "System Events"
    set frontmost of (every process whose unix id is ${targetPid}) to true
end tell`;
      
      execSync(`osascript -e '${script}'`, {
        stdio: 'ignore',
        timeout: 5000,
      });
      
      console.log(`✓ Focus window succeeded for profile ${profileId} on macOS (PID: ${targetPid})`);
      return true;
    } catch (error) {
      console.error(`✗ Error focusing browser on macOS for profile ${profileId}:`, error);
      return false;
    }
  }

  /**
   * Windows API: Enfoca ventana de Chrome usando koffi (Win32 directo, sin PowerShell).
   */
  private focusWindowWindows(profileId: string, processInfo: ProcessInfo, _profile: any): boolean {
    try {
      const api = this.getWin32Api();
      const { koffi, WNDENUMPROC, PROCESSENTRY32,
              EnumWindows, IsWindowVisible, GetWindowTextLengthW, GetWindowThreadProcessId,
              GetForegroundWindow, AttachThreadInput, SetForegroundWindow, ShowWindow,
              BringWindowToTop, GetCurrentThreadId,
              CreateToolhelp32Snapshot, Process32First, Process32Next, CloseHandle } = api;

      const TH32CS_SNAPPROCESS = 0x00000002;

      // Collect all browser PIDs via snapshot
      const browserPids: number[] = [];
      const processNames = this.getBrowserProcessNames();
      const snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
      const entry: any = { dwSize: koffi.sizeof(PROCESSENTRY32) };

      if (Process32First(snapshot, entry)) {
        do {
          const name = Buffer.from(entry.szExeFile).toString('utf8').replace(/\0.*$/, '');
          const nameLower = name.toLowerCase();
          if (processNames.some(pn => nameLower.includes(pn))) browserPids.push(entry.th32ProcessID);
        } while (Process32Next(snapshot, entry));
      }
      CloseHandle(snapshot);

      console.log(`[WinAPI Focus] Found ${browserPids.length} browser PIDs. Stored PID: ${processInfo.pid}`);

      // Prioritize the stored PID (launched by us), then all browser PIDs
      const prioritized = [processInfo.pid, ...browserPids.filter(p => p !== processInfo.pid)];

      let targetHwnd: any = null;

      for (const pid of prioritized) {
        const cb = koffi.register((hwnd: any) => {
          if (targetHwnd) return false;
          if (!IsWindowVisible(hwnd) || GetWindowTextLengthW(hwnd) === 0) return true;
          const pidOut = [0];
          GetWindowThreadProcessId(hwnd, pidOut);
          if (pidOut[0] === pid) { targetHwnd = hwnd; return false; }
          return true;
        }, koffi.pointer(WNDENUMPROC));
        EnumWindows(cb, 0);
        koffi.unregister(cb);
        if (targetHwnd) { console.log(`[WinAPI Focus] Found window for PID ${pid}`); break; }
      }

      if (!targetHwnd) { console.warn(`[WinAPI Focus] No visible Chrome window found`); return false; }

      const fgHwnd = GetForegroundWindow();
      const fgThread = GetWindowThreadProcessId(fgHwnd, null);
      const curThread = GetCurrentThreadId();
      if (fgThread !== curThread) AttachThreadInput(curThread, fgThread, true);
      ShowWindow(targetHwnd, 9);
      BringWindowToTop(targetHwnd);
      SetForegroundWindow(targetHwnd);
      if (fgThread !== curThread) AttachThreadInput(curThread, fgThread, false);

      console.log(`✓ Focus window succeeded for profile ${profileId} via WinAPI (koffi)`);
      return true;
    } catch (e: any) {
      console.error(`✗ WinAPI focus failed: ${e.message}`);
      return false;
    }
  }

  /**
   * Helper: Make HTTP request to CDP endpoint
   */
  private makeHttpRequest(url: string, method: string = 'GET'): Promise<string> {
    const http = require('http');
    return new Promise((resolve, reject) => {
      const options = { method, timeout: 3000 };
      const req = http.request(url, options, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => { data += chunk; });
        res.on('end', () => resolve(data));
      });
      req.on('error', (err: any) => reject(err));
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });
  }

  /**
   * Helper: Make CDP request to open URL in new tab
   */
  private makeHttpCdpRequest(debugPort: number, url: string): Promise<void> {
    const http = require('http');
    return new Promise((resolve, reject) => {
      const postUrl = `http://localhost:${debugPort}/json/new`;
      const postData = `url=${encodeURIComponent(url)}`;
      
      const options = {
        method: 'POST',
        timeout: 3000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      const req = http.request(postUrl, options, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });
      
      req.on('error', (err: any) => reject(err));
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.write(postData);
      req.end();
    });
  }

  /**
   * CDP Method: Usa koffi para llamar AllowSetForegroundWindow directamente desde el proceso
   * Electron (que tiene el foreground), luego abre tab CDP para que Chrome active su ventana,
   * y finalmente llama SetForegroundWindow directamente para forzar el foreground a nivel OS.
   */
  private async focusWindowCDP(profileId: string): Promise<boolean> {
    const debugPort = this.debugPorts.get(profileId);
    if (!debugPort) {
      console.error(`[CDP Focus] No debug port found for profile ${profileId}`);
      return false;
    }

    try {
      // Step 1: Grant all Chrome processes permission to take foreground.
      // This call must come from the current foreground process (Electron).
      // koffi calls Win32 directly — no child process, so Windows honors it.
      if (process.platform === 'win32') {
        this.allowChromeForeground();
      }

      // Step 2: Open a new tab — Chrome activates its window internally
      const newTabUrl = `http://localhost:${debugPort}/json/new?url=about:blank`;
      console.log(`[CDP Focus] Opening temporary tab...`);
      const openData = await this.makeHttpRequest(newTabUrl, 'PUT');
      const newTab = JSON.parse(openData);
      const newTabId = newTab.id;
      console.log(`[CDP Focus] Opened tab: ${newTabId}`);

      // Step 3: Small delay, then force foreground via koffi (EnumWindows + SetForegroundWindow)
      await new Promise(resolve => setTimeout(resolve, 150));
      if (process.platform === 'win32') {
        this.forceWindowsForeground(profileId);
      }

      // Step 4: Close the temporary tab
      await new Promise(resolve => setTimeout(resolve, 150));
      const closeUrl = `http://localhost:${debugPort}/json/close/${newTabId}`;
      await this.makeHttpRequest(closeUrl, 'GET');
      console.log(`✓ Focus window succeeded for profile ${profileId} via CDP`);
      return true;
    } catch (error: any) {
      console.error(`✗ CDP focus failed for profile ${profileId}: ${error.message}`);
      return false;
    }
  }

  private allowChromeForeground(): void {
    try {
      const { AllowSetForegroundWindow, GetCurrentProcessId } = this.getWin32Api();
      const ASFW_ANY = 0xFFFFFFFF;
      AllowSetForegroundWindow(ASFW_ANY);
      console.log(`[koffi] AllowSetForegroundWindow(ASFW_ANY) called from PID ${GetCurrentProcessId()}`);
    } catch (e: any) {
      console.warn(`[koffi] allowChromeForeground failed: ${e.message}`);
    }
  }

  /**
   * Fuerza el foreground de la ventana Chrome del perfil usando koffi (Win32 directo).
   * Usa el PID almacenado del perfil y EnumWindows para encontrar el HWND.
   */
  private forceWindowsForeground(profileId: string): boolean {
    try {
      const api = this.getWin32Api();
      const { koffi, WNDENUMPROC, EnumWindows, IsWindowVisible, GetWindowTextLengthW,
              GetWindowThreadProcessId, GetForegroundWindow, AttachThreadInput,
              SetForegroundWindow, ShowWindow, BringWindowToTop, GetCurrentThreadId } = api;

      // Use stored PID as primary hint; fall back to any visible Chrome window
      const processInfo = this.runningProcesses.get(profileId);
      const hintPid = processInfo?.pid;

      let targetHwnd: any = null;

      const cb = koffi.register((hwnd: any) => {
        if (targetHwnd) return false;
        if (!IsWindowVisible(hwnd) || GetWindowTextLengthW(hwnd) === 0) return true;
        const pidOut = [0];
        GetWindowThreadProcessId(hwnd, pidOut);
        if (hintPid && pidOut[0] === hintPid) { targetHwnd = hwnd; return false; }
        return true;
      }, koffi.pointer(WNDENUMPROC));
      EnumWindows(cb, 0);
      koffi.unregister(cb);

      if (!targetHwnd) {
        console.warn(`[koffi] No visible Chrome window found for profile ${profileId}`);
        return false;
      }

      const fgHwnd = GetForegroundWindow();
      const fgThread = GetWindowThreadProcessId(fgHwnd, null);
      const curThread = GetCurrentThreadId();
      if (fgThread !== curThread) AttachThreadInput(curThread, fgThread, true);
      ShowWindow(targetHwnd, 9);
      BringWindowToTop(targetHwnd);
      SetForegroundWindow(targetHwnd);
      if (fgThread !== curThread) AttachThreadInput(curThread, fgThread, false);

      console.log(`[koffi] ✓ SetForegroundWindow called for Chrome window`);
      return true;
    } catch (e: any) {
      console.warn(`[koffi] forceWindowsForeground failed: ${e.message}`);
      return false;
    }
  }


  /**
   * Intenta enfocar la ventana de Chrome del perfil
   */
  async focusWindow(profileId: string): Promise<boolean> {
    const processInfo = this.runningProcesses.get(profileId);
    if (!processInfo || !processInfo.pid) {
      console.warn(`✗ No process info for profile ${profileId}`);
      return false;
    }

    const profile = storageManager.getProfile(profileId);
    if (!profile) {
      console.warn(`✗ Profile ${profileId} not found`);
      return false;
    }

    try {
      if (process.platform === 'darwin') {
        return this.focusWindowMacOS(profileId, processInfo);
      } else if (process.platform === 'win32') {
        // Check Windows focus method setting
        const settings = storageManager.getSettings();
        const focusMethod = settings.platformPreferences?.focusMethodWindows || 'auto';
        const engine = settings.browserEngine || 'chromium';
        
        // CDP focus only works with Chromium
        if (engine === 'gecko' || focusMethod === 'winapi') {
          return this.focusWindowWindows(profileId, processInfo, profile);
        } else if (focusMethod === 'cdp') {
          return await this.focusWindowCDP(profileId);
        } else {
          // 'auto': Try Windows API first, fallback to CDP if it fails
          const result = this.focusWindowWindows(profileId, processInfo, profile);
          if (!result) {
            console.log(`[Focus] Windows API method failed, falling back to CDP...`);
            return await this.focusWindowCDP(profileId);
          }
          return result;
        }
      } else {
        // Linux: use xdotool to focus by PID
        try {
          const { execSync } = require('child_process');
          execSync(`xdotool search --pid ${processInfo.pid} windowactivate 2>/dev/null`, {
            stdio: 'ignore',
          });
          console.log(`✓ Focus window succeeded for profile ${profileId} on Linux`);
          return true;
        } catch (error) {
          console.error(`✗ Error focusing Chrome window on Linux:`, error);
          return false;
        }
      }
    } catch (error) {
      console.error(`✗ Error focusing window for profile ${profileId}:`, error);
      return false;
    }
  }

  /**
   * Cierra una instancia de Chrome para un perfil
   */
  closeProfile(profileId: string): boolean {
    const processInfo = this.runningProcesses.get(profileId);
    if (!processInfo) return false;

    try {
      const profile = storageManager.getProfile(profileId);
      
      if (process.platform === 'win32') {
        this.closeProcessWindows(processInfo);
      } else if (process.platform === 'darwin') {
        this.closeProcessMacOS(processInfo, profile || undefined);
      } else {
        this.closeProcessLinux(processInfo);
      }

      // Remove from both tracking maps
      this.runningProcesses.delete(profileId);
      if (processInfo.pid > 0) {
        this.browserWindowMap.delete(processInfo.pid);
      }
      console.log(`✓ Closed profile ${profileId}`);
      return true;
    } catch (error) {
      console.error(`Error closing profile ${profileId}:`, error);
      this.runningProcesses.delete(profileId);
      if (processInfo.pid > 0) {
        this.browserWindowMap.delete(processInfo.pid);
      }
      return false;
    }
  }

  /**
   * Obtiene el estado de un perfil revisando si el proceso está vivo
   */
  getProfileStatus(profileId: string): boolean {
    const processInfo = this.runningProcesses.get(profileId);
    if (!processInfo) return false;

    try {
      const profile = storageManager.getProfile(profileId);
      let isAlive = false;

      if (process.platform === 'darwin') {
        isAlive = this.getProfileStatusMacOS(processInfo, profile || undefined);
      } else if (process.platform === 'win32') {
        isAlive = this.getProfileStatusWindows(processInfo);
      } else {
        isAlive = this.getProfileStatusLinux(processInfo);
      }

      if (!isAlive) {
        this.cleanupProfile(profileId, processInfo);
      }
      
      return isAlive;
    } catch (error) {
      console.log(`Process ${profileId} is no longer alive, removing from tracking`);
      this.cleanupProfile(profileId, processInfo);
      return false;
    }
  }

  /**
   * Limpia un perfil de ambos mapas cuando se detecta que está muerto
   */
  private cleanupProfile(profileId: string, processInfo: ProcessInfo): void {
    this.runningProcesses.delete(profileId);
    if (processInfo.pid > 0) {
      this.browserWindowMap.delete(processInfo.pid);
      console.log(`✓ Cleaned up profile ${profileId} (PID ${processInfo.pid}) from tracking`);
    }
  }

  /**
   * Obtiene todos los perfiles activos
   */
  getActiveProfiles(): string[] {
    return Array.from(this.runningProcesses.keys());
  }

  /**
   * Cierra todos los perfiles activos (usado al cerrar la app)
   */
  closeAllProfiles(): void {
    const activeProfiles = this.getActiveProfiles();
    console.log(`Closing ${activeProfiles.length} active Chrome profiles...`);
    for (const profileId of activeProfiles) {
      try {
        this.closeProfile(profileId);
        console.log(`✓ Closed profile ${profileId}`);
      } catch (error) {
        console.error(`✗ Error closing profile ${profileId}:`, error);
      }
    }
    console.log('All profiles closed');
  }

  /**
   * Limpia los procesos que ya no existen - se ejecuta periodicamente
   */
  private cleanupDeadProcesses(): void {
    for (const [profileId, processInfo] of Array.from(this.runningProcesses.entries())) {
      // Use getProfileStatus which handles cleanup properly
      if (!this.getProfileStatus(profileId)) {
        console.log(`Detected dead process during cleanup: ${profileId}`);
      }
    }
  }

  /**
   * Inicia un interval para limpiar procesos muertos cada 2 segundos
   */
  startProcessMonitoring(): void {
    setInterval(() => {
      this.cleanupDeadProcesses();
    }, 2000);
  }

  /**
   * Install missing extensions based on global settings preference
   * DISABLED: Extension opening system needs to be reworked
   */
  async openExtensionsIfNeeded(profile: BrowserProfile, settings: any): Promise<void> {
    // TODO: Re-implement extension opening with proper CDP/WebSocket support
    console.log(`Profile ${profile.id}: Extension opening disabled for now`);
    return;
  }

  /**
   * Registra metadatos de un perfil (llamado cuando se crea o edita)
   */
  updateProfileMetadata(profileId: string, profile: BrowserProfile): void {
    this.profileMetadataMap.set(profileId, {
      folderId: profile.folderId,
      name: profile.name,
      color: profile.color,
      icon: profile.icon,
      xAccount: profile.xAccount,
      dataDir: profile.dataDir,
      createdAt: profile.createdAt,
    });
    console.log(`✓ Updated metadata for profile ${profileId}`);
  }

  /**
   * Obtiene metadatos de un perfil
   */
  getProfileMetadata(profileId: string): any {
    return this.profileMetadataMap.get(profileId);
  }

  /**
   * Carga todos los metadatos de perfiles desde storage
   */
  loadProfileMetadata(profiles: BrowserProfile[]): void {
    this.profileMetadataMap.clear();
    for (const profile of profiles) {
      this.updateProfileMetadata(profile.id, profile);
    }
    console.log(`✓ Loaded metadata for ${profiles.length} profiles`);
  }

  /**
   * Elimina metadatos de un perfil (llamado cuando se elimina)
   */
  deleteProfileMetadata(profileId: string): void {
    this.profileMetadataMap.delete(profileId);
    console.log(`✓ Deleted metadata for profile ${profileId}`);
  }
}

export const chromeLauncher = new ChromeLauncher();
