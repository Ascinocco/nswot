import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { Workspace } from '../domain/types';

interface WorkspaceRow {
  id: string;
  path: string;
  name: string;
  created_at: string;
  last_opened_at: string;
}

function toDomain(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    createdAt: row.created_at,
    lastOpenedAt: row.last_opened_at,
  };
}

export class WorkspaceRepository {
  constructor(private readonly db: Database.Database) {}

  async findById(id: string): Promise<Workspace | null> {
    const row = this.db
      .prepare('SELECT id, path, name, created_at, last_opened_at FROM workspaces WHERE id = ?')
      .get(id) as WorkspaceRow | undefined;
    return row ? toDomain(row) : null;
  }

  async findByPath(path: string): Promise<Workspace | null> {
    const row = this.db
      .prepare('SELECT id, path, name, created_at, last_opened_at FROM workspaces WHERE path = ?')
      .get(path) as WorkspaceRow | undefined;
    return row ? toDomain(row) : null;
  }

  async insert(path: string, name: string): Promise<Workspace> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO workspaces (id, path, name, created_at, last_opened_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, path, name, now, now);
    return { id, path, name, createdAt: now, lastOpenedAt: now };
  }

  async updateLastOpened(id: string): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE workspaces SET last_opened_at = ? WHERE id = ?')
      .run(now, id);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
  }
}
