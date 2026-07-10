/**
 * Types compartidos entre main y renderer
 */
export interface BrowserProfile {
    id: string;
    name: string;
    color: string;
    icon: string;
    dataDir: string;
    xAccount?: string;
    createdAt: number;
    lastAccessed?: number;
    isActive?: boolean;
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
//# sourceMappingURL=index.d.ts.map