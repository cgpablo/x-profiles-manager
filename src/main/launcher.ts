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
   * Windows: Enfoca ventana de Chrome buscando por dataDir en command line
   * Estrategia: 
   * 1. Busca todos los procesos chrome.exe
   * 2. Para cada uno, obtiene el MainWindowHandle (HWND)
   * 3. Compara el command line con el dataDir del perfil
   * 4. Cuando encuentra match, usa SetForegroundWindow para traer al frente
   */
  private focusWindowWindows(profileId: string, processInfo: ProcessInfo, profile: any): boolean {
    const { execSync } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    try {
      console.log(`[Windows Focus] Starting focus for profile ${profileId}`);
      console.log(`[Windows Focus] PID: ${processInfo.pid}, DataDir: ${profile.dataDir}`);
      
      // Crear script PowerShell que busca Chrome por dataDir
      // Normalize el path: convertir backslashes a forward slashes y a lowercase
      const normalizedDataDir = profile.dataDir.replace(/\\/g, '/').toLowerCase();
      
      // Script PowerShell que:
      // 1. Busca todos los procesos chrome.exe
      // 2. Lee su command line
      // 3. Normaliza el path (backslash -> forward slash, lowercase)
      // 4. Busca la coincidencia de user-data-dir
      // 5. Trae al frente cuando encuentra match
      
      const ps1Script = `
$ErrorActionPreference = "SilentlyContinue"

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class WindowHelper {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    
    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);
}
"@

$dataDir = "${normalizedDataDir}"
$found = $false

Write-Output "[DEBUG] Looking for Chrome with dataDir: $dataDir"

$processes = Get-Process -Name "chrome" -ErrorAction SilentlyContinue
Write-Output "[DEBUG] Found $($processes.Count) Chrome processes"

foreach ($proc in $processes) {
    try {
        $cmdLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($proc.Id)" -ErrorAction SilentlyContinue).CommandLine
        if ($cmdLine) {
            $normalizedCmdLine = $cmdLine.Replace("\\\\", "/").ToLower()
            
            if ($normalizedCmdLine -match "user-data-dir=([^\\s]+)") {
                $userDataDirValue = $matches[1]
                $userDataDirNormalized = $userDataDirValue.Trim('"').Replace("\\\\", "/").ToLower()
                
                Write-Output "[DEBUG] PID $($proc.Id): user-data-dir = $userDataDirNormalized"
                
                if ($userDataDirNormalized -eq $dataDir) {
                    Write-Output "[SUCCESS] MATCH! PID $($proc.Id) with window handle $($proc.MainWindowHandle)"
                    
                    if ($proc.MainWindowHandle -ne 0) {
                        [WindowHelper]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
                        [WindowHelper]::BringWindowToTop($proc.MainWindowHandle) | Out-Null
                        [WindowHelper]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
                        Write-Output "[SUCCESS] Window brought to front"
                        $found = $true
                        break
                    }
                }
            }
        }
    } catch {
        Write-Output "[ERROR] Exception processing PID $($proc.Id): $_"
    }
}

if ($found) {
    exit 0
} else {
    Write-Output "[FAIL] Could not find Chrome window matching dataDir"
    exit 1
}
`;
      
      const scriptPath = path.join(os.tmpdir(), `focus-${profileId}-${Date.now()}.ps1`);
      fs.writeFileSync(scriptPath, ps1Script, 'utf8');
      console.log(`[Windows Focus] Created PowerShell script at: ${scriptPath}`);
      
      try {
        const result = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, {
          encoding: 'utf8',
          timeout: 5000,
        });
        
        console.log(`[Windows Focus] PowerShell output:\n${result}`);
        console.log(`✓ Focus window succeeded for profile ${profileId} on Windows`);
        return true;
      } catch (e: any) {
        console.log(`[Windows Focus] Failed to focus: ${e.message}`);
        console.log(`[Windows Focus] stderr: ${e.stderr ? e.stderr.toString() : 'none'}`);
        console.log(`[Windows Focus] stdout: ${e.stdout ? e.stdout.toString() : 'none'}`);
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
   * Windows Workaround: Abre una nueva pestaña temporalmente y luego la cierra
   * Esto fuerza a Chrome a traer la ventana al frente
   */
  private focusWindowWindowsWorkaround(profileId: string, processInfo: ProcessInfo): boolean {
    const http = require('http');
    
    try {
      console.log(`[Windows Workaround] Starting focus workaround for profile ${profileId}`);
      
      const debugPort = this.debugPorts.get(profileId);
      if (!debugPort) {
        console.error(`[Windows Workaround] No debug port found for profile ${profileId}`);
        return false;
      }

      console.log(`[Windows Workaround] Using debug port: ${debugPort}`);

      // Step 1: Get list of tabs
      const tabsUrl = `http://localhost:${debugPort}/json/list`;
      
      try {
        const req = http.get(tabsUrl, { timeout: 2000 }, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => { data += chunk; });
          res.on('end', () => {
            try {
              const tabs = JSON.parse(data);
              console.log(`[Windows Workaround] Found ${tabs.length} tabs`);
              
              if (tabs.length === 0) {
                console.log(`[Windows Workaround] No tabs found, cannot focus`);
                return;
              }
              
              // Step 2: Open a new tab
              const newTabUrl = `http://localhost:${debugPort}/json/new?url=about:blank`;
              console.log(`[Windows Workaround] Opening temporary tab...`);
              
              http.get(newTabUrl, { timeout: 2000 }, (openRes: any) => {
                let openData = '';
                openRes.on('data', (chunk: any) => { openData += chunk; });
                openRes.on('end', () => {
                  try {
                    const newTab = JSON.parse(openData);
                    const newTabId = newTab.id;
                    console.log(`[Windows Workaround] Opened tab: ${newTabId}, window will activate`);
                    
                    // Step 3: Small delay then close the temporary tab
                    setTimeout(() => {
                      const closeUrl = `http://localhost:${debugPort}/json/close/${newTabId}`;
                      console.log(`[Windows Workaround] Closing temporary tab...`);
                      
                      http.get(closeUrl, { timeout: 2000 }, (closeRes: any) => {
                        closeRes.on('data', () => {});
                        closeRes.on('end', () => {
                          console.log(`✓ Focus window succeeded for profile ${profileId} on Windows (workaround)`);
                        });
                      }).on('error', (err: any) => {
                        console.error(`[Windows Workaround] Error closing tab: ${err.message}`);
                      });
                    }, 300);
                  } catch (e) {
                    console.error(`[Windows Workaround] Error parsing new tab response: ${e}`);
                  }
                });
              }).on('error', (err: any) => {
                console.error(`[Windows Workaround] Error opening new tab: ${err.message}`);
              });
            } catch (e) {
              console.error(`[Windows Workaround] Error parsing tabs response: ${e}`);
            }
          });
        });
        
        req.on('error', (err: any) => {
          console.log(`[Windows Workaround] Could not connect to CDP: ${err.message}`);
        });
        
        req.on('timeout', () => {
          req.destroy();
          console.log(`[Windows Workaround] CDP connection timed out`);
        });
        
        // Return true immediately - operations continue in background
        return true;
      } catch (error) {
        console.error(`[Windows Workaround] Error during HTTP request:`, error);
        return false;
      }
    } catch (error) {
      console.error(`✗ Error in Windows workaround:`, error);
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
        // Check Windows focus method setting
        const settings = storageManager.getSettings();
        const focusMethod = settings.platformPreferences?.focusMethodWindows || 'auto';
        
        if (focusMethod === 'cdp') {
          return this.focusWindowWindowsWorkaround(profileId, processInfo);
        } else if (focusMethod === 'winapi') {
          return this.focusWindowWindows(profileId, processInfo, profile);
        } else {
          // 'auto': Try Windows API first, fallback to CDP if it fails
          const result = this.focusWindowWindows(profileId, processInfo, profile);
          if (!result) {
            console.log(`[Focus] Windows API method failed, falling back to CDP...`);
            return this.focusWindowWindowsWorkaround(profileId, processInfo);
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
