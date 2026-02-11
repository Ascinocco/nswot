import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { ChatMessage } from '../domain/types';

interface ChatMessageRow {
  id: string;
  analysis_id: string;
  role: string;
  content: string;
  created_at: string;
}

function toDomain(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    role: row.role as ChatMessage['role'],
    content: row.content,
    createdAt: row.created_at,
  };
}

export class ChatRepository {
  constructor(private readonly db: Database.Database) {}

  async findByAnalysis(analysisId: string): Promise<ChatMessage[]> {
    const rows = this.db
      .prepare(
        'SELECT id, analysis_id, role, content, created_at FROM chat_messages WHERE analysis_id = ? ORDER BY created_at ASC',
      )
      .all(analysisId) as ChatMessageRow[];
    return rows.map(toDomain);
  }

  async insert(analysisId: string, role: ChatMessage['role'], content: string): Promise<ChatMessage> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO chat_messages (id, analysis_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, analysisId, role, content, now);
    return { id, analysisId, role, content, createdAt: now };
  }

  async deleteByAnalysis(analysisId: string): Promise<void> {
    this.db.prepare('DELETE FROM chat_messages WHERE analysis_id = ?').run(analysisId);
  }

  async countByAnalysis(analysisId: string): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM chat_messages WHERE analysis_id = ?')
      .get(analysisId) as { count: number };
    return row.count;
  }
}
