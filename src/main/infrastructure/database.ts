import Database from 'better-sqlite3';
import { MIGRATIONS } from '../db/migrations';

export type { Database } from 'better-sqlite3';

export function initializeDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  return db;
}

function runMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return;

  const runAll = db.transaction(() => {
    for (const migration of pending) {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    }
  });

  runAll();
}
