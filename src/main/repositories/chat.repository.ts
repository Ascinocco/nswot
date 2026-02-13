import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { ChatMessage } from '../domain/types';

interface ChatMessageRow {
  id: string;
  analysis_id: string;
  role: string;
  content: string;
  content_format: string;
  created_at: string;
}

function toDomain(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    role: row.role as ChatMessage['role'],
    content: row.content,
    contentFormat: (row.content_format ?? 'text') as ChatMessage['contentFormat'],
    createdAt: row.created_at,
  };
}

export class ChatRepository {
  constructor(private readonly db: Database.Database) {}

  async findByAnalysis(analysisId: string): Promise<ChatMessage[]> {
    const rows = this.db
      .prepare(
        'SELECT id, analysis_id, role, content, content_format, created_at FROM chat_messages WHERE analysis_id = ? ORDER BY created_at ASC',
      )
      .all(analysisId) as ChatMessageRow[];
    return rows.map(toDomain);
  }

  async insert(
    analysisId: string,
    role: ChatMessage['role'],
    content: string,
    contentFormat: ChatMessage['contentFormat'] = 'text',
  ): Promise<ChatMessage> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO chat_messages (id, analysis_id, role, content, content_format, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, analysisId, role, content, contentFormat, now);
    return { id, analysisId, role, content, contentFormat, createdAt: now };
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
