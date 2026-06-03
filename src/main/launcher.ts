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

      const args = [
        `--user-data-dir=${profile.dataDir}`,
        `--no-first-run`,
        `--no-default-browser-check`,
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
      return processInfo;
    } catch (error) {
      console.error(`Error launching profile ${profileId}:`, error);
      return null;
    }
  }

  /**
   * Intenta enfocar la ventana de Chrome del perfil
   */
  focusWindow(profileId: string): boolean {
    const processInfo = this.runningProcesses.get(profileId);
    if (!processInfo || !processInfo.pid) return false;

    try {
      if (process.platform === 'darwin') {
        // macOS: Activate Google Chrome and bring to foreground
        const { execSync } = require('child_process');
        try {
          // Use AppleScript to activate Chrome - this is the most reliable way
          const script = `tell application "Google Chrome"
    activate
    set frontmost to true
end tell`;
          execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
            stdio: 'ignore',
            timeout: 5000,
          });
          console.log(`✓ Focus window succeeded for profile ${profileId}`);
          return true;
        } catch (error) {
          console.error(`✗ Error focusing Chrome on macOS for profile ${profileId}:`, error);
          return false;
        }
      } else if (process.platform === 'win32') {
        // Windows: Find and focus window by PID using a temporary PowerShell script file
        const { execSync } = require('child_process');
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        
        try {
          const script = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  
  public class WindowHelper {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  }
"@

\\$targetPID = ${processInfo.pid}
\\$found = \\$false

[WindowHelper]::EnumWindows({
  param([IntPtr]\\$hWnd, [IntPtr]\\$lParam)
  \\$pid = 0
  [WindowHelper]::GetWindowThreadProcessId(\\$hWnd, [ref]\\$pid)
  
  if (\\$pid -eq \\$targetPID -and [WindowHelper]::IsWindowVisible(\\$hWnd)) {
    [WindowHelper]::SetForegroundWindow(\\$hWnd) | Out-Null
    \\$script:found = \\$true
    return \\$false
  }
  return \\$true
}, 0)

if (\\$found) {
  Write-Host "SUCCESS"
  exit 0
} else {
  Write-Host "FAILED"
  exit 1
}
`;
           
          // Write script to temp file
          const scriptPath = path.join(os.tmpdir(), `focus-window-${Date.now()}.ps1`);
          fs.writeFileSync(scriptPath, script);
          
          try {
            const output = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, {
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'pipe'],
              timeout: 5000,
            });
            console.log(`✓ Focus window succeeded for profile ${profileId}`);
            return true;
          } catch (execError: any) {
            // Check if it's exit code 1 (window not found) vs other errors
            if (execError.status === 1) {
              console.warn(`⚠ Could not find Chrome window for profile ${profileId} (PID ${processInfo.pid})`);
              return false;
            }
            console.error(`✗ Focus window script error for profile ${profileId}:`, execError.message);
            return false;
          } finally {
            // Clean up temp file
            try {
              fs.unlinkSync(scriptPath);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        } catch (error) {
          console.error('Error in focus window setup:', error);
          return false;
        }
      } else {
        // Linux: use xdotool to focus by PID
        try {
          const { execSync } = require('child_process');
          execSync(`xdotool search --pid ${processInfo.pid} windowactivate 2>/dev/null`, {
            stdio: 'ignore',
          });
          return true;
        } catch (error) {
          console.error('Error focusing Chrome window on Linux:', error);
          return false;
        }
      }
    } catch (error) {
      console.error(`Error focusing window for profile ${profileId}:`, error);
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
        // Windows: use taskkill
        spawn('taskkill', ['/PID', processInfo.pid.toString(), '/T', '/F'], {
          stdio: 'ignore',
        });
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
        process.kill(-processInfo.pid, 'SIGTERM');
      }

      this.runningProcesses.delete(profileId);
      return true;
    } catch (error) {
      console.error(`Error closing profile ${profileId}:`, error);
      this.runningProcesses.delete(profileId);
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
          this.runningProcesses.delete(profileId);
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
          this.runningProcesses.delete(profileId);
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
          const lines = output.trim().split('\n').filter(l => l.trim().length > 0);
          
          if (lines.length > 0 && lines[0].includes('chrome')) {
            console.log(`✓ Process ${profileId} (PID ${processInfo.pid}) is still alive`);
            return true;
          } else {
            console.log(`✗ Process ${profileId} (PID ${processInfo.pid}) no longer exists (tasklist returned: "${output.trim()}")`);
            this.runningProcesses.delete(profileId);
            return false;
          }
        } catch (error: any) {
          // tasklist command failed, assume process is dead
          console.log(`✗ Could not verify process ${profileId}, assuming dead:`, error.message);
          this.runningProcesses.delete(profileId);
          return false;
        }
      } else {
        // macOS & Linux: use kill with signal 0 to check without killing
        process.kill(processInfo.pid, 0);
        return true;
      }
    } catch (error) {
      // Process is dead
      console.log(`Process ${profileId} is no longer alive, removing from tracking`);
      this.runningProcesses.delete(profileId);
      return false;
    }
  }

  /**
   * Obtiene todos los perfiles activos
   */
  getActiveProfiles(): string[] {
    return Array.from(this.runningProcesses.keys());
  }

  /**
   * Limpia los procesos que ya no existen
   */
  private cleanupDeadProcesses(): void {
    for (const [profileId, processInfo] of this.runningProcesses.entries()) {
      try {
        if (process.platform === 'win32') {
          // On Windows, we can't easily check, so we keep it in the map
          // This is a limitation - in production, use process monitoring
        } else {
          process.kill(processInfo.pid, 0);
        }
      } catch {
        this.runningProcesses.delete(profileId);
      }
    }
  }
}

export const chromeLauncher = new ChromeLauncher();
