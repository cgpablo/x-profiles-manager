/**
 * Puertos del núcleo (core).
 *
 * El core no importa nada de Node, Electron ni Capacitor. Todo lo que necesita
 * del entorno entra por estas interfaces, que implementa cada plataforma.
 */

import { AppSettings, BrowserProfile, ProcessInfo } from './types';

/**
 * Persistencia de documentos JSON pequeños (perfiles, carpetas, ajustes, contraseñas, correos).
 *
 * Es SÍNCRONA a propósito: el lanzador de desktop consulta ajustes y perfiles desde
 * funciones síncronas. En Android se implementa con una caché en memoria cargada al
 * arrancar y escritura diferida.
 */
export type DocumentName = 'profiles' | 'folders' | 'settings' | 'passwords' | 'mails';

export interface DocumentStore {
  /** `undefined` si el documento no existe. Lanza si existe pero no es JSON válido. */
  read<T>(name: DocumentName): T | undefined;
  write(name: DocumentName, value: unknown): void;
  remove(name: DocumentName): void;
}

/**
 * Directorios de datos del navegador por perfil. Solo tienen sentido en desktop;
 * en Android las implementaciones son no-op y `dataDirFor` devuelve ''.
 */
export interface ProfileDataPort {
  dataDirFor(baseDir: string, profileName: string): string;
  exists(dir: string): boolean;
  ensure(dir: string): void;
  rename(from: string, to: string): void;
  remove(dir: string): void;
}

/** Imágenes de perfil e iconos, y lectura de ficheros arbitrarios por ruta. */
export interface AssetStore {
  /** Copia un fichero externo al almacén de iconos y devuelve su ruta final. */
  importIcon(sourcePath: string): Promise<string>;
  deleteAllIcons(): Promise<void>;
  listIcons(): Promise<Array<{ name: string; path: string }>>;
  /** Escribe el icono si no existe ya y devuelve su ruta (exista o no de antes). */
  ensureIcon(fileName: string, data: Uint8Array): Promise<string>;
  /** `null` si el fichero no existe o no se puede leer. */
  readFile(path: string): Promise<Uint8Array | null>;
  /** Normaliza una ruta para compararla con otras (en desktop, `path.resolve`). */
  normalize(path: string): string;
}

export interface ArchiveEntry {
  name: string;
  isDirectory: boolean;
  data(): Uint8Array;
}

export interface ArchiveCodec {
  create(entries: Array<{ name: string; data: Uint8Array }>): Promise<Uint8Array>;
  read(bytes: Uint8Array): Promise<ArchiveEntry[]>;
}

/**
 * Cifrado de contraseñas. El formato almacenado es `iv_hex:data_hex` (AES-256-CBC con
 * clave derivada con scrypt) y debe ser idéntico en todas las plataformas para que los
 * backups sean portables.
 */
export interface SecretCipher {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

/** Lanzador de navegador de cada plataforma (Chromium/Gecko en desktop, GeckoView en Android). */
export interface BrowserLauncher {
  launch(profileId: string, url?: string): Promise<ProcessInfo | null>;
  close(profileId: string): boolean;
  isActive(profileId: string): boolean;
  getActive(): string[];
  focusWindow(profileId: string): Promise<boolean>;
  autoLogin(profileId: string, username: string, password: string): Promise<boolean>;
  isLoggedIn(profileId: string): Promise<boolean>;
  isOnHomeUrl(profileId: string): Promise<boolean>;
  fillPinRecovery(profileId: string, pin: string | null): Promise<boolean>;
  openChat(profileId: string): Promise<boolean>;

  /** Ganchos opcionales para que el lanzador mantenga su propia copia de los perfiles. */
  profileSaved?(profile: BrowserProfile): void;
  profileDeleted?(profileId: string): void;
  /** Se llama justo tras lanzar un perfil (por ejemplo, para abrir las extensiones pendientes). */
  afterLaunch?(profile: BrowserProfile, settings: AppSettings): void | Promise<void>;
}

export interface CoreDeps {
  documents: DocumentStore;
  profileData: ProfileDataPort;
  assets: AssetStore;
  archive: ArchiveCodec;
  cipher: SecretCipher;
  /** Ajustes por defecto de la plataforma (rutas de navegador, directorio de perfiles...). */
  defaultSettings(): AppSettings;
  newId(): string;
  now(): number;
}
