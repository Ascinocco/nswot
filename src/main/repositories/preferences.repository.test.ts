import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../../test/helpers/test-db';
import { PreferencesRepository } from './preferences.repository';

describe('PreferencesRepository', () => {
  let db: Database.Database;
  let repo: PreferencesRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new PreferencesRepository(db);
  });

  it('returns null for nonexistent key', async () => {
    const result = await repo.get('nonexistent');
    expect(result).toBeNull();
  });

  it('sets and gets a preference', async () => {
    await repo.set('theme', 'dark');
    const result = await repo.get('theme');
    expect(result).toEqual({ key: 'theme', value: 'dark' });
  });

  it('upserts on duplicate key', async () => {
    await repo.set('theme', 'dark');
    await repo.set('theme', 'light');
    const result = await repo.get('theme');
    expect(result).toEqual({ key: 'theme', value: 'light' });
  });

  it('deletes a preference', async () => {
    await repo.set('theme', 'dark');
    await repo.delete('theme');
    const result = await repo.get('theme');
    expect(result).toBeNull();
  });

  it('returns all preferences', async () => {
    await repo.set('theme', 'dark');
    await repo.set('lang', 'en');
    const all = await repo.getAll();
    expect(all).toEqual({ theme: 'dark', lang: 'en' });
  });

  it('returns empty object when no preferences exist', async () => {
    const all = await repo.getAll();
    expect(all).toEqual({});
  });
});
