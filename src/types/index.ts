/**
 * Types compartidos entre main y renderer
 */

export interface ProfileFolder {
  id: string;
  name: string;
  color: string; // Hex color
  icon: string; // Unicode icon
  createdAt: number;
  order: number; // For sorting
}

export interface ChromeProfile {
  id: string;
  name: string;
  color: string; // Hex color
  icon: string; // Unicode icon or custom identifier
  imagePath?: string; // Optional: path to custom image/thumbnail
  dataDir: string; // Full path to Chrome user-data-dir
  xAccount?: string; // Optional: associated X account
  folderId?: string; // Optional: parent folder ID
  createdAt: number;
  lastAccessed?: number;
  isActive?: boolean;
  orderIndex?: number; // For sorting profiles
  installedExtensions?: {
    ublockOriginLite?: boolean;
    twitterControl?: boolean;
  };
  extensionsPromptShown?: boolean; // Flag: have we already shown the extension setup prompt?
}

export interface AppSettings {
  chromePath: string;
  edgePath?: string;
  profilesDir: string;
  windowLayout?: 'floating' | 'tiled';
  autoLaunchOnStartup?: boolean;
  backupIcons?: boolean;
  platformPreferences?: {
    enableFocusWindows?: boolean; // Enable/disable focus window feature
    developerMode?: boolean; // Show developer options (focus method selector, debug mode)
    focusMethodWindows?: 'auto' | 'winapi' | 'cdp'; // Windows: which method to use
    debugMode?: boolean; // Enable extra logging
    extensionsConfig?: {
      ublockOriginLite?: boolean;
      twitterControl?: boolean;
    };
  };
}

export interface ProcessInfo {
  profileId: string;
  pid: number;
  windowHandle?: number; // Windows HWND or other platform window identifier
  startTime: number;
}

export interface IpcRequest {
  type: string;
  payload?: any;
}

export interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
