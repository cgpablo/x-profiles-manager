import { unzipSync, zipSync } from 'fflate';
import type { ArchiveCodec, ArchiveEntry } from '@xpm/core';

/** Zip del backup. Compatible con los zips que genera y lee desktop (adm-zip). */
export class FflateArchive implements ArchiveCodec {
  async create(entries: Array<{ name: string; data: Uint8Array }>): Promise<Uint8Array> {
    const files: Record<string, Uint8Array> = {};
    for (const entry of entries) files[entry.name] = entry.data;
    return zipSync(files);
  }

  async read(bytes: Uint8Array): Promise<ArchiveEntry[]> {
    const files = unzipSync(bytes);
    return Object.entries(files).map(([name, data]) => ({
      name,
      isDirectory: name.endsWith('/'),
      data: () => data,
    }));
  }
}
