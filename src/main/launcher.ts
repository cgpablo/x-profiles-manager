/**
 * Chrome Launcher - Abre Chrome con un perfil específico
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { storageManager } from './storage';
import { ProcessInfo, ChromeProfile } from '../types';

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
   * Platform-specific: Close Chrome process on Windows
   */
  private closeProcessWindows(processInfo: ProcessInfo): void {
    const { execSync } = require('child_process');
    try {
      if (processInfo.pid && processInfo.pid > 0) {
        try {
          execSync(`taskkill /PID ${processInfo.pid} /T /F`, {
            stdio: 'ignore',
            timeout: 5000,
          });
        } catch (e) {
          console.warn(`Could not kill PID ${processInfo.pid}, trying by name...`);
          execSync(`taskkill /IM chrome.exe /F`, {
            stdio: 'ignore',
            timeout: 5000,
          });
        }
      }
    } catch (error) {
      console.error(`Error in taskkill for Windows:`, error);
    }
  }

  /**
   * Platform-specific: Close Chrome process on macOS
   */
  private closeProcessMacOS(processInfo: ProcessInfo, profile?: ChromeProfile): void {
    const { execSync } = require('child_process');
    if (processInfo.pid && processInfo.pid > 0) {
      try { process.kill(processInfo.pid, 'SIGTERM'); } catch {}
    }
    if (profile) {
      try {
        execSync(`pkill -f ${JSON.stringify('user-data-dir=' + profile.dataDir)}`, { stdio: 'ignore' });
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
      return lines.length > 0 && lines[0].includes('chrome');
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Platform-specific: Check if profile process is running on macOS
   */
  private getProfileStatusMacOS(processInfo: ProcessInfo, profile?: ChromeProfile): boolean {
    const { execSync } = require('child_process');
    if (!profile) return false;
    
    try {
      execSync(`pgrep -f ${JSON.stringify('user-data-dir=' + profile.dataDir)}`, {
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
      return false;
    }
  }

  /**
   * Creates an HTML interstitial page that injects the xprofile into storage
   */
  private createInterstitialPage(profile: ChromeProfile): string {
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
   * Lanza Chrome con un perfil específico
   */
  async launchProfile(profileId: string, url: string = 'https://x.com'): Promise<ProcessInfo | null> {
    const profile = storageManager.getProfile(profileId);
    if (!profile) return null;

    const settings = storageManager.getSettings();

    // If already running, return existing process info
    if (this.runningProcesses.has(profileId)) {
      console.log(`Profile ${profileId} already running`);
      return this.runningProcesses.get(profileId) || null;
    }

    try {
      const chromePath = settings.chromePath;

      // Check if Chrome exists
      if (!chromePath) {
        throw new Error('Chrome path not configured');
      }

      // Generate a unique debug port for this profile (9222 + hash)
      const debugPort = this.getDebugPort(profileId);
      this.debugPorts.set(profileId, debugPort);

      const args = [
        `--user-data-dir=${profile.dataDir}`,
        `--no-first-run`,
        `--no-default-browser-check`,
        `--remote-debugging-port=${debugPort}`,
      ];

      // Build the URL - use interstitial page if xAccount is specified
      let finalUrl = url;
      if (profile.xAccount) {
        finalUrl = this.createInterstitialPage(profile);
      }
      args.push(finalUrl);

      let pid = 0;

      // Platform-specific launching
      if (process.platform === 'darwin') {
        // macOS: spawn Chrome binary directly so multiple profiles can run as separate instances.
        if (!fs.existsSync(chromePath)) {
          throw new Error(`Chrome not found at ${chromePath}`);
        }
        
        const proc = spawn(chromePath, args, {
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
         // Windows: use chrome.exe directly with no-activate flag
         if (!fs.existsSync(chromePath)) {
           throw new Error(`Chrome not found at ${chromePath}`);
         }

         args.push('--disable-activate-on-launch');

         const proc = spawn(chromePath, args, {
           detached: true,
           stdio: 'ignore',
           shell: false,
         });
         
         pid = proc.pid || 0;
         proc.unref();
      } else {
        // Linux and others
        if (!fs.existsSync(chromePath)) {
          throw new Error(`Chrome not found at ${chromePath}`);
        }

        const proc = spawn(chromePath, args, {
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
   * macOS: Enfoca ventana de Chrome por PID Unix
   */
  private focusWindowMacOS(profileId: string, processInfo: ProcessInfo): boolean {
    const { execSync } = require('child_process');
    try {
      console.log(`[macOS Focus] Starting focus for profile ${profileId} (PID: ${processInfo.pid})`);
      
      // Activate Chrome application
      execSync(`open -a "Google Chrome"`, { stdio: 'ignore' });
      console.log(`[macOS Focus] Opened Chrome app`);
      
      // Use osascript to specifically activate the window by process PID
      const script = `tell application "System Events"
    set frontmost of (every process whose unix id is ${processInfo.pid}) to true
end tell`;
      
      execSync(`osascript -e '${script}'`, {
        stdio: 'ignore',
        timeout: 5000,
      });
      
      console.log(`✓ Focus window succeeded for profile ${profileId} on macOS (PID: ${processInfo.pid})`);
      return true;
    } catch (error) {
      console.error(`✗ Error focusing Chrome on macOS for profile ${profileId}:`, error);
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

      // Collect all chrome.exe PIDs via snapshot
      const chromePids: number[] = [];
      const snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
      const entry: any = { dwSize: koffi.sizeof(PROCESSENTRY32) };

      if (Process32First(snapshot, entry)) {
        do {
          const name = Buffer.from(entry.szExeFile).toString('utf8').replace(/\0.*$/, '');
          if (name.toLowerCase() === 'chrome.exe') chromePids.push(entry.th32ProcessID);
        } while (Process32Next(snapshot, entry));
      }
      CloseHandle(snapshot);

      console.log(`[WinAPI Focus] Found ${chromePids.length} chrome.exe PIDs. Stored PID: ${processInfo.pid}`);

      // Prioritize the stored PID (launched by us), then all chrome PIDs
      const prioritized = [processInfo.pid, ...chromePids.filter(p => p !== processInfo.pid)];

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
   * CDP Method: Usa koffi para llamar AllowSetForegroundWindow directamente desde el proceso
   * Electron (que tiene el foreground), luego abre tab CDP para que Chrome active su ventana,
   * y finalmente llama SetForegroundWindow directamente para forzar el foreground a nivel OS.
   */
  private async focusWindowCDP(profileId: string): Promise<boolean> {
    const http = require('http');

    const debugPort = this.debugPorts.get(profileId);
    if (!debugPort) {
      console.error(`[CDP Focus] No debug port found for profile ${profileId}`);
      return false;
    }

    const httpRequest = (url: string, method: string = 'GET'): Promise<string> => {
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
    };

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
      const openData = await httpRequest(newTabUrl, 'PUT');
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
      await httpRequest(closeUrl, 'GET');
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
        
        if (focusMethod === 'cdp') {
          return await this.focusWindowCDP(profileId);
        } else if (focusMethod === 'winapi') {
          return this.focusWindowWindows(profileId, processInfo, profile);
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
   * Registra metadatos de un perfil (llamado cuando se crea o edita)
   */
  updateProfileMetadata(profileId: string, profile: ChromeProfile): void {
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
  loadProfileMetadata(profiles: ChromeProfile[]): void {
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
