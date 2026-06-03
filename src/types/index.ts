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
}

export interface AppSettings {
  chromePath: string;
  edgePath?: string;
  profilesDir: string;
  windowLayout?: 'floating' | 'tiled';
  autoLaunchOnStartup?: boolean;
}

export interface ProcessInfo {
  profileId: string;
  pid: number;
  windowId?: number;
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
