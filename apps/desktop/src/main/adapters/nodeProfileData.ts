import * as fs from 'fs';
import * as path from 'path';
import { ProfileDataPort } from '@xpm/core';

/** Directorios de datos del navegador, uno por perfil. */
export class NodeProfileData implements ProfileDataPort {
  dataDirFor(baseDir: string, profileName: string): string {
    return path.join(baseDir, profileName.replace(/\s+/g, '_'));
  }

  exists(dir: string): boolean {
    return fs.existsSync(dir);
  }

  ensure(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
  }

  rename(from: string, to: string): void {
    fs.renameSync(from, to);
  }

  remove(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
