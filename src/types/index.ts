/**
 * Types compartidos entre main y renderer
 */

export interface PasswordEntry {
  id: string;
  name: string;
  encryptedValue: string; // "iv_hex:data_hex"
  profileIds: string[];
  createdAt: number;
  updatedAt?: number;
}

export interface MailEntry {
  id: string;
  email: string;
  profileIds: string[];
  createdAt: number;
  updatedAt?: number;
}

export interface FCLink {
  text: string;
  url: string;
}

export interface FCCharacterInfo {
  ig?: string[];
  x?: string[];
  sc?: FCLink[];
}

export interface ProfileFolder {
  id: string;
  name: string;
  color: string; // Hex color
  icon: string; // Unicode icon
  createdAt: number;
  order: number; // For sorting
}

export interface BrowserProfile {
  id: string;
  name: string;
  color: string; // Hex color
  icon: string; // Unicode icon or custom identifier
  imagePath?: string; // Optional: path to custom image/thumbnail
  dataDir: string; // Full path to browser profile directory
  xAccount?: string; // Optional: associated X account
  folderId?: string; // Optional: parent folder ID
  createdAt: number;
  lastAccessed?: number;
  isActive?: boolean;
  orderIndex?: number; // For sorting profiles
  starred?: boolean; // Starred/favourited profile
  locked?: boolean; // Locked: hide edit/delete options. undefined or true = locked (default)
  fcInfo?: FCCharacterInfo; // Fan Character info
  hasPassword?: boolean; // True if a password entry is linked to this profile
  hasMail?: boolean;     // True if a mail entry is linked to this profile (runtime-derived)
  mailEmail?: string;    // The associated email address (runtime-derived)
  installedExtensions?: {
    ublockOriginLite?: boolean;
    twitterControl?: boolean;
  };
  extensionsPromptShown?: boolean; // Flag: have we already shown the extension setup prompt?
}

export type BrowserEngine = 'chromium' | 'gecko';

export interface AppSettings {
  browserEngine: BrowserEngine;
  chromePath: string;
  edgePath?: string;
  geckoPath?: string; // Firefox, Zen Browser, LibreWolf, etc.
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
    showPasswordManager?: boolean; // Show Password Manager in sidebar
    showMailManager?: boolean; // Show Mail Manager in sidebar
    showCharacterHub?: boolean; // Show Character Hub in sidebar
    showFreedcamp?: boolean; // Show Freedcamp in sidebar
    showDashboard?: boolean; // Show Dashboard button in sidebar (default true)
    showDirectory?: boolean; // Show "open directory" button on profile cards (requires developerMode)
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
