import { Directory, Filesystem } from '@capacitor/filesystem';
import type { AssetStore } from '@xpm/core';
import { base64ToBytes, bytesToBase64 } from './bytes';

const ICONS_DIR = 'xpm/icons';

const extOf = (p: string) => {
  const base = p.split(/[\\/]/).pop() || '';
  const idx = base.lastIndexOf('.');
  return idx <= 0 ? '' : base.slice(idx);
};

/** Iconos e imágenes de perfil en el almacenamiento privado de la app. */
export class CapacitorAssetStore implements AssetStore {
  private async uriOf(path: string): Promise<string> {
    return (await Filesystem.getUri({ path, directory: Directory.Data })).uri;
  }

  async importIcon(sourcePath: string): Promise<string> {
    const path = `${ICONS_DIR}/${crypto.randomUUID()}${extOf(sourcePath)}`;
    await Filesystem.mkdir({ path: ICONS_DIR, directory: Directory.Data, recursive: true }).catch(() => {});
    await Filesystem.copy({ from: sourcePath, to: path, toDirectory: Directory.Data });
    return this.uriOf(path);
  }

  async deleteAllIcons(): Promise<void> {
    for (const icon of await this.listIcons()) {
      await Filesystem.deleteFile({ path: `${ICONS_DIR}/${icon.name}`, directory: Directory.Data });
    }
  }

  async listIcons(): Promise<Array<{ name: string; path: string }>> {
    try {
      const { files } = await Filesystem.readdir({ path: ICONS_DIR, directory: Directory.Data });
      const result: Array<{ name: string; path: string }> = [];
      for (const file of files) {
        if (file.type !== 'file') continue;
        result.push({ name: file.name, path: await this.uriOf(`${ICONS_DIR}/${file.name}`) });
      }
      return result;
    } catch {
      return [];
    }
  }

  async ensureIcon(fileName: string, data: Uint8Array): Promise<string> {
    const path = `${ICONS_DIR}/${fileName}`;
    const exists = await Filesystem.stat({ path, directory: Directory.Data }).then(
      () => true,
      () => false
    );
    if (!exists) {
      await Filesystem.writeFile({ path, directory: Directory.Data, data: bytesToBase64(data), recursive: true });
    }
    return this.uriOf(path);
  }

  async readFile(path: string): Promise<Uint8Array | null> {
    try {
      const result = await Filesystem.readFile({ path });
      return typeof result.data === 'string' ? base64ToBytes(result.data) : new Uint8Array(await result.data.arrayBuffer());
    } catch {
      return null;
    }
  }

  normalize(path: string): string {
    return path;
  }
}
