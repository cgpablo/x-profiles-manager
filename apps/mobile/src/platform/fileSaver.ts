import { registerPlugin } from '@capacitor/core';

/** Plugin propio (Kotlin: FileSaverPlugin.kt): cuadro "Guardar como…" de Android. */
export interface FileSaverPlugin {
  /** `saved` es `false` si el usuario cancela. */
  save(options: { uri: string; fileName: string; mimeType?: string }): Promise<{ saved: boolean; uri?: string }>;
}

export const FileSaver = registerPlugin<FileSaverPlugin>('FileSaver');
