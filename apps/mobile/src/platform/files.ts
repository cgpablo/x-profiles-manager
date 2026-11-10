import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileSaver } from './fileSaver';
import { base64ToBytes, bytesToBase64 } from './bytes';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
};

/** Muestra el selector de ficheros de Android. Devuelve `null` si el usuario cancela. */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let done = false;
    const finish = (file: File | null) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

/** Escribe bytes en la caché de la app y devuelve su URI. */
async function writeCache(path: string, bytes: Uint8Array): Promise<string> {
  await Filesystem.writeFile({ path, directory: Directory.Cache, data: bytesToBase64(bytes), recursive: true });
  return (await Filesystem.getUri({ path, directory: Directory.Cache })).uri;
}

async function readUri(uri: string): Promise<Uint8Array> {
  const result = await Filesystem.readFile({ path: uri });
  return typeof result.data === 'string' ? base64ToBytes(result.data) : new Uint8Array(await result.data.arrayBuffer());
}

const extOf = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.')) : '');

/** Todo lo que la app móvil necesita del sistema de ficheros fuera del core. */
export class MobileFiles {
  /** Selector de imágenes (u otros ficheros). Devuelve los URIs copiados a la caché de la app. */
  async pickFiles(filters?: Array<{ name: string; extensions: string[] }>): Promise<string[]> {
    const exts = (filters || []).flatMap((f) => f.extensions).filter((e) => e && e !== '*');
    const accept = exts.length ? exts.map((e) => `.${e}`).join(',') : 'image/*';
    const file = await pickFile(accept);
    if (!file) return [];
    const bytes = new Uint8Array(await file.arrayBuffer());
    return [await writeCache(`picked/${crypto.randomUUID()}${extOf(file.name)}`, bytes)];
  }

  async toDataUrl(path: string): Promise<string> {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    return `data:${MIME[ext] || 'image/jpeg'};base64,${bytesToBase64(await readUri(path))}`;
  }

  /** Abre el selector para elegir un backup. Devuelve su URI en la caché y sus bytes. */
  async pickBackup(): Promise<{ path: string; bytes: Uint8Array } | null> {
    const file = await pickFile('.zip,application/zip,application/x-zip-compressed');
    if (!file) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { path: await writeCache(`backups/import-${crypto.randomUUID()}.zip`, bytes), bytes };
  }

  readBackup(path: string): Promise<Uint8Array> {
    return readUri(path);
  }

  /**
   * Guarda el backup donde el usuario elija con el cuadro "Guardar como…" de Android.
   * Devuelve `false` si cancela.
   */
  async saveBackup(fileName: string, bytes: Uint8Array): Promise<boolean> {
    const uri = await writeCache(`backups/${fileName}`, bytes);
    const { saved } = await FileSaver.save({ uri, fileName, mimeType: 'application/zip' });
    return saved;
  }
}
