import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../main/db/migrations';

export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  for (const migration of MIGRATIONS) {
    db.exec(migration.sql);
    db.pragma(`user_version = ${migration.version}`);
  }

  return db;
}
