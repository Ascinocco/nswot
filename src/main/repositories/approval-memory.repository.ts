import type Database from 'better-sqlite3';

export interface ApprovalMemoryEntry {
  conversationId: string;
  toolName: string;
  allowed: boolean;
}

interface ApprovalMemoryRow {
  conversation_id: string;
  tool_name: string;
  allowed: number;
}

function toDomain(row: ApprovalMemoryRow): ApprovalMemoryEntry {
  return {
    conversationId: row.conversation_id,
    toolName: row.tool_name,
    allowed: row.allowed === 1,
  };
}

export class ApprovalMemoryRepository {
  constructor(private readonly db: Database.Database) {}

  async findByConversation(conversationId: string): Promise<ApprovalMemoryEntry[]> {
    const rows = this.db
      .prepare(
        'SELECT conversation_id, tool_name, allowed FROM approval_memory WHERE conversation_id = ?',
      )
      .all(conversationId) as ApprovalMemoryRow[];
    return rows.map(toDomain);
  }

  async isApproved(conversationId: string, toolName: string): Promise<boolean> {
    const row = this.db
      .prepare(
        'SELECT allowed FROM approval_memory WHERE conversation_id = ? AND tool_name = ?',
      )
      .get(conversationId, toolName) as { allowed: number } | undefined;
    return row?.allowed === 1;
  }

  async set(conversationId: string, toolName: string, allowed: boolean): Promise<void> {
    this.db
      .prepare(
        'INSERT INTO approval_memory (conversation_id, tool_name, allowed) VALUES (?, ?, ?) ON CONFLICT (conversation_id, tool_name) DO UPDATE SET allowed = excluded.allowed',
      )
      .run(conversationId, toolName, allowed ? 1 : 0);
  }

  async deleteByConversation(conversationId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM approval_memory WHERE conversation_id = ?')
      .run(conversationId);
  }
}
