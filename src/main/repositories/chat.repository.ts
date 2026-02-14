import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { ChatMessage } from '../domain/types';
import type { ContentBlock } from '../domain/content-block.types';

interface ChatMessageRow {
  id: string;
  analysis_id: string;
  role: string;
  content: string;
  content_format: string;
  created_at: string;
}

function toDomain(row: ChatMessageRow): ChatMessage {
  const contentFormat = (row.content_format ?? 'text') as ChatMessage['contentFormat'];
  const message: ChatMessage = {
    id: row.id,
    analysisId: row.analysis_id,
    role: row.role as ChatMessage['role'],
    content: row.content,
    contentFormat,
    createdAt: row.created_at,
  };

  // Parse blocks from JSON when content format is 'blocks'
  if (contentFormat === 'blocks' && row.content) {
    try {
      message.blocks = JSON.parse(row.content) as ContentBlock[];
    } catch {
      // Malformed JSON — leave blocks undefined, content as raw string
    }
  }

  return message;
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
    const message: ChatMessage = { id, analysisId, role, content, contentFormat, createdAt: now };
    // Parse blocks on insert to match toDomain() behavior for reads
    if (contentFormat === 'blocks' && content) {
      try {
        message.blocks = JSON.parse(content) as ContentBlock[];
      } catch {
        // Malformed JSON — leave blocks undefined
      }
    }
    return message;
  }

  async deleteById(id: string): Promise<void> {
    this.db.prepare('DELETE FROM chat_messages WHERE id = ?').run(id);
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
