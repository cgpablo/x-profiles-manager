import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { DocumentName, DocumentStore } from '@xpm/core';

const DIR = 'xpm';
const NAMES: DocumentName[] = ['profiles', 'folders', 'settings', 'passwords', 'mails'];
const fileOf = (name: DocumentName) => `${DIR}/${name}.json`;

/**
 * Almacén de documentos JSON para Android.
 *
 * El core lo usa de forma síncrona, pero el sistema de ficheros de Capacitor es asíncrono.
 * Por eso se cargan todos los documentos en memoria al abrir (son pequeños) y las escrituras
 * se encolan en segundo plano, en orden.
 *
 * Se guarda el TEXTO de cada documento y `read` lo parsea cada vez, igual que hacía el
 * almacén de desktop con el fichero: quien lee recibe siempre una copia que puede mutar.
 */
export class CapacitorDocumentStore implements DocumentStore {
  private texts = new Map<DocumentName, string>();
  private queue: Promise<void> = Promise.resolve();

  static async open(): Promise<CapacitorDocumentStore> {
    const store = new CapacitorDocumentStore();
    await Filesystem.mkdir({ path: DIR, directory: Directory.Data, recursive: true }).catch(() => {});
    // Se lista el directorio para leer solo lo que existe (así no hay errores en el primer arranque)
    const existing = await Filesystem.readdir({ path: DIR, directory: Directory.Data }).then(
      (result) => new Set(result.files.map((file) => file.name)),
      () => new Set<string>()
    );
    for (const name of NAMES) {
      if (!existing.has(`${name}.json`)) continue;
      const result = await Filesystem.readFile({
        path: fileOf(name),
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      store.texts.set(name, result.data as string);
    }
    return store;
  }

  read<T>(name: DocumentName): T | undefined {
    const text = this.texts.get(name);
    return text === undefined ? undefined : (JSON.parse(text) as T);
  }

  write(name: DocumentName, value: unknown): void {
    const text = JSON.stringify(value, null, 2);
    this.texts.set(name, text);
    this.enqueue(() =>
      Filesystem.writeFile({
        path: fileOf(name),
        directory: Directory.Data,
        data: text,
        encoding: Encoding.UTF8,
        recursive: true,
      }).then(() => undefined)
    );
  }

  remove(name: DocumentName): void {
    this.texts.delete(name);
    this.enqueue(() =>
      Filesystem.deleteFile({ path: fileOf(name), directory: Directory.Data }).then(
        () => undefined,
        () => undefined
      )
    );
  }

  /** Espera a que todas las escrituras pendientes lleguen a disco. */
  flush(): Promise<void> {
    return this.queue;
  }

  private enqueue(job: () => Promise<void>): void {
    this.queue = this.queue.then(job).catch((error) => {
      console.error('Error persisting document', error);
    });
  }
}
