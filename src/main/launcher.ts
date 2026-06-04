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
  private browserWindowMap: Map<number, string> = new Map(); // pid => profileId
  private profileMetadataMap: Map<string, any> = new Map(); // profileId => { folderId, name, color, icon, xAccount, dataDir }
  private debugPorts: Map<string, number> = new Map(); // profileId => debugPort

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
        
        // Try to get the window handle for this process
        let windowHandle = 0;
        if (pid > 0) {
          windowHandle = this.getWindowHandleWindows(pid, profileId);
        }
        
        const processInfo: ProcessInfo = {
          profileId,
          pid,
          windowHandle,
          startTime: Date.now(),
        };

        this.runningProcesses.set(profileId, processInfo);
        if (pid > 0) {
          this.browserWindowMap.set(pid, profileId);
        }
        console.log(`[Windows Launch] Launched profile ${profileId} with PID ${pid} and window handle ${windowHandle}`);
        return processInfo;
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
   * Windows: Obtiene el window handle de un proceso Chrome (con reintentos)
   */
  private getWindowHandleWindows(pid: number, profileId: string): number {
    const { execSync } = require('child_process');
    
    // Retry a few times because the window might not be created immediately
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const result = execSync(
          `powershell -NoProfile -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty MainWindowHandle"`,
          { encoding: 'utf8', timeout: 2000 }
        ).trim();
        
        const hwnd = parseInt(result, 10);
        if (hwnd > 0) {
          console.log(`[Windows Launch] Got window handle ${hwnd} for PID ${pid} (attempt ${attempt + 1})`);
          return hwnd;
        }
      } catch (e) {
        // Continue retrying
      }
      
      // Wait a bit before retrying
      const delay = Math.min(100 * (attempt + 1), 500);
      require('child_process').execSync(`timeout /t ${Math.ceil(delay / 1000)}`, { stdio: 'ignore' });
    }
    
    console.warn(`[Windows Launch] Could not get window handle for PID ${pid} after retries`);
    return 0;
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
   * Windows: Enfoca ventana de Chrome por windowHandle o búsqueda
   */
  private focusWindowWindows(profileId: string, processInfo: ProcessInfo, profile: any): boolean {
    const { execSync } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    try {
      console.log(`[Windows Focus] Starting focus for profile ${profileId}`);
      console.log(`[Windows Focus] PID: ${processInfo.pid}, WindowHandle: ${processInfo.windowHandle}`);
      
      // If we have a stored window handle, use it directly
      if (processInfo.windowHandle && processInfo.windowHandle > 0) {
        console.log(`[Windows Focus] Using stored window handle: ${processInfo.windowHandle}`);
        
        const ps1Script = [
          'Add-Type @"',
          'using System;',
          'using System.Runtime.InteropServices;',
          '',
          'public class WindowHelper {',
          '    [DllImport("user32.dll")]',
          '    public static extern bool SetForegroundWindow(IntPtr hWnd);',
          '    ',
          '    [DllImport("user32.dll")]',
          '    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);',
          '}',
          '"@',
          '',
          '$hwnd = [IntPtr]' + processInfo.windowHandle,
          '[WindowHelper]::ShowWindow($hwnd, 9) | Out-Null',
          '[WindowHelper]::SetForegroundWindow($hwnd) | Out-Null',
          'Write-Output "[SUCCESS] Window brought to front using stored handle"',
          'exit 0',
        ].join('\r\n');
        
        const scriptPath = path.join(os.tmpdir(), `focus-${profileId}-${Date.now()}.ps1`);
        fs.writeFileSync(scriptPath, ps1Script, 'utf8');
        
        try {
          const result = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, {
            encoding: 'utf8',
            timeout: 5000,
          });
          
          console.log(`[Windows Focus] PowerShell output:\n${result}`);
          console.log(`✓ Focus window succeeded for profile ${profileId} on Windows (via stored handle)`);
          return true;
        } catch (e: any) {
          console.log(`[Windows Focus] Failed with stored handle: ${e.message}`);
          // Fall through to try search by dataDir
        } finally {
          try { fs.unlinkSync(scriptPath); } catch {}
        }
      }
      
      // Fallback: search by dataDir
      console.log(`[Windows Focus] Searching by dataDir: ${profile.dataDir}`);
      const dataDirForPS = profile.dataDir.replace(/"/g, '`"');
      
      const ps1Script = [
        '$ErrorActionPreference = "SilentlyContinue"',
        '',
        'Add-Type @"',
        'using System;',
        'using System.Runtime.InteropServices;',
        '',
        'public class WindowHelper {',
        '    [DllImport("user32.dll")]',
        '    public static extern bool SetForegroundWindow(IntPtr hWnd);',
        '    ',
        '    [DllImport("user32.dll")]',
        '    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);',
        '}',
        '"@',
        '',
        '$dataDir = "' + dataDirForPS + '"',
        'Write-Output "[DEBUG] Looking for Chrome with dataDir: $dataDir"',
        '',
        '$wmiProcesses = Get-WmiObject Win32_Process -Filter "Name = \'chrome.exe\'" -ErrorAction SilentlyContinue',
        'Write-Output "[DEBUG] Found $($wmiProcesses.Count) Chrome WMI processes"',
        '',
        '$found = $false',
        '',
        'foreach ($wmiProc in $wmiProcesses) {',
        '    $cmdLine = $wmiProc.CommandLine',
        '    if ($cmdLine) {',
        '        if ($cmdLine.Contains($dataDir)) {',
        '            Write-Output "[DEBUG] MATCH! PID $($wmiProc.ProcessId)"',
        '            $proc = Get-Process -Id $wmiProc.ProcessId -ErrorAction SilentlyContinue',
        '            if ($proc -and $proc.MainWindowHandle -ne 0) {',
        '                [WindowHelper]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null',
        '                [WindowHelper]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null',
        '                Write-Output "[SUCCESS] Window brought to front"',
        '                $found = $true',
        '                break',
        '            }',
        '        }',
        '    }',
        '}',
        '',
        'if ($found) {',
        '    exit 0',
        '} else {',
        '    Write-Output "[FAIL] Could not find Chrome window"',
        '    exit 1',
        '}',
      ].join('\r\n');
      
      const scriptPath = path.join(os.tmpdir(), `focus-${profileId}-${Date.now()}.ps1`);
      fs.writeFileSync(scriptPath, ps1Script, 'utf8');
      console.log(`[Windows Focus] Created search script`);
      
      try {
        const result = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, {
          encoding: 'utf8',
          timeout: 5000,
        });
        
        console.log(`[Windows Focus] PowerShell output:\n${result}`);
        console.log(`✓ Focus window succeeded for profile ${profileId} on Windows`);
        return true;
      } catch (e: any) {
        console.log(`[Windows Focus] Search failed: ${e.message}`);
        return false;
      } finally {
        try { fs.unlinkSync(scriptPath); } catch {}
      }
    } catch (error) {
      console.error(`✗ Error focusing Chrome on Windows:`, error);
      return false;
    }
  }

  /**
   * Intenta enfocar la ventana de Chrome del perfil
   */
  focusWindow(profileId: string): boolean {
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
        return this.focusWindowWindows(profileId, processInfo, profile);
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
      if (process.platform === 'win32') {
        // Windows: use taskkill with proper waiting
        const { execSync } = require('child_process');
        try {
          // First try to kill by PID
          if (processInfo.pid && processInfo.pid > 0) {
            try {
              execSync(`taskkill /PID ${processInfo.pid} /T /F`, {
                stdio: 'ignore',
                timeout: 5000,
              });
            } catch (e) {
              console.warn(`Could not kill PID ${processInfo.pid}, trying by name...`);
              // Fallback: kill all chrome processes for this profile
              execSync(`taskkill /IM chrome.exe /F`, {
                stdio: 'ignore',
                timeout: 5000,
              });
            }
          }
        } catch (error) {
          console.error(`Error in taskkill for Windows:`, error);
        }
      } else if (process.platform === 'darwin') {
        // macOS: kill by pid first; also use pkill -f on user-data-dir as a fallback
        const profile = storageManager.getProfile(profileId);
        if (processInfo.pid && processInfo.pid > 0) {
          try { process.kill(processInfo.pid, 'SIGTERM'); } catch {}
        }
        if (profile) {
          try {
            execSync(`pkill -f ${JSON.stringify('user-data-dir=' + profile.dataDir)}`, { stdio: 'ignore' });
          } catch {}
        }
      } else {
        // Linux: use kill signal on process group
        try {
          process.kill(-processInfo.pid, 'SIGTERM');
        } catch (e) {
          console.warn(`Could not kill process group for ${profileId}`, e);
        }
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
      if (process.platform === 'darwin') {
        // On macOS we launch via `open -g` which exits immediately,
        // so the stored pid is the `open` process pid, not Chrome.
        // Use pgrep to check if Chrome is running with this profile's data dir.
        const profile = storageManager.getProfile(profileId);
        if (!profile) {
          this.cleanupProfile(profileId, processInfo);
          return false;
        }
        const { execSync } = require('child_process');
        try {
          // pgrep returns exit code 0 if at least one process matches
          execSync(`pgrep -f ${JSON.stringify('user-data-dir=' + profile.dataDir)}`, {
            stdio: 'ignore',
          });
          return true;
        } catch {
          this.cleanupProfile(profileId, processInfo);
          return false;
        }
      } else if (process.platform === 'win32') {
        // Windows: use tasklist to check if process exists
        // This is more reliable than assuming it's running
        const { execSync } = require('child_process');
        try {
          const output = execSync(`tasklist /FI "PID eq ${processInfo.pid}" /NH`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
          });
          // tasklist returns output even if nothing matches; check for actual process info
          const lines = output.trim().split('\n').filter((l: string) => l.trim().length > 0);
          
          if (lines.length > 0 && lines[0].includes('chrome')) {
            return true;
          } else {
            console.log(`✗ Process ${profileId} (PID ${processInfo.pid}) no longer exists`);
            this.cleanupProfile(profileId, processInfo);
            return false;
          }
        } catch (error: any) {
          // tasklist command failed, assume process is dead
          console.log(`✗ Could not verify process ${profileId}, assuming dead`);
          this.cleanupProfile(profileId, processInfo);
          return false;
        }
      } else {
        // Linux: use kill with signal 0 to check without killing
        try {
          process.kill(processInfo.pid, 0);
          return true;
        } catch {
          this.cleanupProfile(profileId, processInfo);
          return false;
        }
      }
    } catch (error) {
      // Process is dead
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
