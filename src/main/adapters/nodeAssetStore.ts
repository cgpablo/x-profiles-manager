import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import { AssetStore } from '../../core';

export class NodeAssetStore implements AssetStore {
  constructor(private iconsDir: string) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  async importIcon(sourcePath: string): Promise<string> {
    const destPath = path.join(this.iconsDir, `${uuid()}${path.extname(sourcePath)}`);
    fs.copyFileSync(sourcePath, destPath);
    return destPath;
  }

  async deleteAllIcons(): Promise<void> {
    if (fs.existsSync(this.iconsDir)) {
      for (const file of fs.readdirSync(this.iconsDir)) {
        fs.unlinkSync(path.join(this.iconsDir, file));
      }
    }
  }

  async listIcons(): Promise<Array<{ name: string; path: string }>> {
    if (!fs.existsSync(this.iconsDir)) return [];
    const result: Array<{ name: string; path: string }> = [];
    for (const name of fs.readdirSync(this.iconsDir)) {
      const filePath = path.join(this.iconsDir, name);
      try {
        if (fs.statSync(filePath).isFile()) {
          result.push({ name, path: filePath });
        }
      } catch {
        // Skip unreadable files
      }
    }
    return result;
  }

  async ensureIcon(fileName: string, data: Uint8Array): Promise<string> {
    const destPath = path.join(this.iconsDir, fileName);
    if (!fs.existsSync(destPath)) {
      fs.writeFileSync(destPath, data);
    }
    return destPath;
  }

  async readFile(filePath: string): Promise<Uint8Array | null> {
    try {
      if (!fs.existsSync(filePath)) return null;
      return fs.readFileSync(filePath);
    } catch {
      return null;
    }
  }

  normalize(filePath: string): string {
    return path.resolve(filePath);
  }
}
