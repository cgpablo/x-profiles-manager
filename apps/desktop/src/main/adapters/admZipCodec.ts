import AdmZip from 'adm-zip';
import { ArchiveCodec, ArchiveEntry } from '@xpm/core';

export class AdmZipCodec implements ArchiveCodec {
  async create(entries: Array<{ name: string; data: Uint8Array }>): Promise<Uint8Array> {
    const zip = new AdmZip();
    for (const entry of entries) {
      zip.addFile(entry.name, Buffer.from(entry.data));
    }
    return zip.toBuffer();
  }

  async read(bytes: Uint8Array): Promise<ArchiveEntry[]> {
    const zip = new AdmZip(Buffer.from(bytes));
    return zip.getEntries().map((e) => ({
      name: e.entryName,
      isDirectory: e.isDirectory,
      data: () => e.getData(),
    }));
  }
}
