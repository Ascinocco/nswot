import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { Conversation } from '../domain/types';

interface ConversationRow {
  id: string;
  workspace_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

function toDomain(row: ConversationRow): Conversation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ConversationRepository {
  constructor(private readonly db: Database.Database) {}

  async findByWorkspace(workspaceId: string): Promise<Conversation[]> {
    const rows = this.db
      .prepare(
        'SELECT id, workspace_id, title, created_at, updated_at FROM conversations WHERE workspace_id = ? ORDER BY updated_at DESC',
      )
      .all(workspaceId) as ConversationRow[];
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Conversation | null> {
    const row = this.db
      .prepare(
        'SELECT id, workspace_id, title, created_at, updated_at FROM conversations WHERE id = ?',
      )
      .get(id) as ConversationRow | undefined;
    return row ? toDomain(row) : null;
  }

  async insert(workspaceId: string, title?: string | null): Promise<Conversation> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO conversations (id, workspace_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, workspaceId, title ?? null, now, now);
    return { id, workspaceId, title: title ?? null, createdAt: now, updatedAt: now };
  }

  async updateTitle(id: string, title: string): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, now, id);
  }

  async updateTimestamp(id: string): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(now, id);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  /**
   * Delete a conversation and cascade-clean related data in a single transaction:
   * - Delete chat_messages and chat_actions for linked analyses
   * - Clear conversation_id on linked analyses (keep the analyses themselves)
   * - Delete the conversation row (approval_memory cascades via FK)
   */
  deleteWithCascade(id: string): void {
    const run = this.db.transaction(() => {
      const rows = this.db
        .prepare('SELECT id FROM analyses WHERE conversation_id = ?')
        .all(id) as { id: string }[];

      for (const row of rows) {
        this.db.prepare('DELETE FROM chat_messages WHERE analysis_id = ?').run(row.id);
        this.db.prepare('DELETE FROM chat_actions WHERE analysis_id = ?').run(row.id);
      }

      this.db
        .prepare('UPDATE analyses SET conversation_id = NULL WHERE conversation_id = ?')
        .run(id);

      this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    });
    run();
  }
}
