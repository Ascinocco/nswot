import { safeStorage } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'fs';

export interface SecureStorage {
  store(key: string, value: string): void;
  retrieve(key: string): string | null;
  remove(key: string): void;
  isAvailable(): boolean;
}

interface Keystore {
  [key: string]: string; // base64-encoded encrypted blobs
}

export function createSecureStorage(keystorePath: string): SecureStorage {
  function readKeystore(): Keystore {
    if (!existsSync(keystorePath)) return {};
    const raw = readFileSync(keystorePath, 'utf-8');
    return JSON.parse(raw) as Keystore;
  }

  function writeKeystore(keystore: Keystore): void {
    writeFileSync(keystorePath, JSON.stringify(keystore, null, 2), 'utf-8');
  }

  return {
    store(key: string, value: string): void {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption is not available on this system');
      }
      const encrypted = safeStorage.encryptString(value);
      const keystore = readKeystore();
      keystore[key] = encrypted.toString('base64');
      writeKeystore(keystore);
    },

    retrieve(key: string): string | null {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption is not available on this system');
      }
      const keystore = readKeystore();
      const blob = keystore[key];
      if (!blob) return null;
      const buffer = Buffer.from(blob, 'base64');
      return safeStorage.decryptString(buffer);
    },

    remove(key: string): void {
      const keystore = readKeystore();
      delete keystore[key];
      writeKeystore(keystore);
    },

    isAvailable(): boolean {
      return safeStorage.isEncryptionAvailable();
    },
  };
}
