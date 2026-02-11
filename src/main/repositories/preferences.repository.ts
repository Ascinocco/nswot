import type Database from 'better-sqlite3';
import type { Preference } from '../domain/types';

interface PreferenceRow {
  key: string;
  value: string;
}

function toDomain(row: PreferenceRow): Preference {
  return { key: row.key, value: row.value };
}

export class PreferencesRepository {
  constructor(private readonly db: Database.Database) {}

  async get(key: string): Promise<Preference | null> {
    const row = this.db
      .prepare('SELECT key, value FROM preferences WHERE key = ?')
      .get(key) as PreferenceRow | undefined;
    return row ? toDomain(row) : null;
  }

  async set(key: string, value: string): Promise<void> {
    this.db
      .prepare(
        'INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  async delete(key: string): Promise<void> {
    this.db.prepare('DELETE FROM preferences WHERE key = ?').run(key);
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = this.db
      .prepare('SELECT key, value FROM preferences')
      .all() as PreferenceRow[];
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }
}
