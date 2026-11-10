import * as crypto from 'crypto';
import { SecretCipher } from '@xpm/core';

const ALGORITHM = 'aes-256-cbc';
// Derive a 32-byte key once at module load. Do NOT change these constants:
// stored passwords and backups depend on this exact key.
const KEY = crypto.scryptSync('x-profiles-manager-pw-v1', 'xpm-pw-salt-static', 32);

export class NodeSecretCipher implements SecretCipher {
  encrypt(plain: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(stored: string): string {
    const [ivHex, dataHex] = stored.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf-8');
  }
}
