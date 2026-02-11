import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSecureStorage } from './safe-storage';
import type { SecureStorage } from './safe-storage';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Mock electron
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`)),
    decryptString: vi.fn((buffer: Buffer) => {
      const str = buffer.toString();
      return str.replace('encrypted:', '');
    }),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);

describe('SecureStorage', () => {
  let storage: SecureStorage;
  let storedData: string;

  beforeEach(() => {
    vi.clearAllMocks();
    storedData = '{}';

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => storedData);
    mockedWriteFileSync.mockImplementation((_path, data) => {
      storedData = data as string;
    });

    storage = createSecureStorage('/fake/keystore');
  });

  it('round-trips store and retrieve', () => {
    storage.store('test-key', 'secret-value');
    const result = storage.retrieve('test-key');
    expect(result).toBe('secret-value');
  });

  it('returns null for missing key', () => {
    const result = storage.retrieve('nonexistent');
    expect(result).toBeNull();
  });

  it('removes a stored key', () => {
    storage.store('test-key', 'secret-value');
    storage.remove('test-key');
    const result = storage.retrieve('test-key');
    expect(result).toBeNull();
  });

  it('reports availability', () => {
    expect(storage.isAvailable()).toBe(true);
  });

  it('throws when encryption is unavailable on store', async () => {
    const { safeStorage } = await import('electron');
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false);

    expect(() => storage.store('key', 'value')).toThrow('Encryption is not available');
  });

  it('throws when encryption is unavailable on retrieve', async () => {
    const { safeStorage } = await import('electron');
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false);

    expect(() => storage.retrieve('key')).toThrow('Encryption is not available');
  });

  it('creates keystore file on first store when file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    // readKeystore should return {} when file doesn't exist
    storage.store('key', 'value');
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });
});
