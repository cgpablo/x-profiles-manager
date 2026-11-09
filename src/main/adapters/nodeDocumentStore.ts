import * as fs from 'fs';
import * as path from 'path';
import { DocumentName, DocumentStore } from '../../core';

/** Guarda cada documento como un fichero JSON (mismas rutas que antes de extraer el core). */
export class NodeDocumentStore implements DocumentStore {
  constructor(private files: Record<DocumentName, string>) {
    for (const file of Object.values(files)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
    }
  }

  read<T>(name: DocumentName): T | undefined {
    const file = this.files[name];
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  }

  write(name: DocumentName, value: unknown): void {
    fs.writeFileSync(this.files[name], JSON.stringify(value, null, 2), 'utf-8');
  }

  remove(name: DocumentName): void {
    const file = this.files[name];
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
}
