import { cbc } from '@noble/ciphers/aes';
import { scrypt } from '@noble/hashes/scrypt';
import type { SecretCipher } from '@xpm/core';
import { bytesToHex, hexToBytes } from './bytes';

const utf8 = new TextEncoder();
const text = new TextDecoder();

let cachedKey: Uint8Array | undefined;

/**
 * Misma clave que en desktop: scrypt('x-profiles-manager-pw-v1', 'xpm-pw-salt-static', 32)
 * con los parámetros por defecto de Node (N=16384, r=8, p=1). NO cambiar estas constantes:
 * los backups de desktop dependen de esta clave. Se deriva una vez, la primera vez que hace falta.
 */
const getKey = () =>
  (cachedKey ??= scrypt(utf8.encode('x-profiles-manager-pw-v1'), utf8.encode('xpm-pw-salt-static'), {
    N: 16384,
    r: 8,
    p: 1,
    dkLen: 32,
  }));

/** AES-256-CBC con relleno PKCS7 y formato `iv_hex:data_hex`, idéntico al de desktop. */
export class NobleSecretCipher implements SecretCipher {
  encrypt(plain: string): string {
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const data = cbc(getKey(), iv).encrypt(utf8.encode(plain));
    return `${bytesToHex(iv)}:${bytesToHex(data)}`;
  }

  decrypt(stored: string): string {
    const [ivHex, dataHex] = stored.split(':');
    return text.decode(cbc(getKey(), hexToBytes(ivHex)).decrypt(hexToBytes(dataHex)));
  }
}
