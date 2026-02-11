import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { ChatAction, ActionResult, ActionStatus, ActionToolName } from '../domain/types';

interface ChatActionRow {
  id: string;
  analysis_id: string;
  chat_message_id: string | null;
  tool_name: string;
  tool_input: string;
  status: string;
  result: string | null;
  created_at: string;
  executed_at: string | null;
}

function toDomain(row: ChatActionRow): ChatAction {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    chatMessageId: row.chat_message_id,
    toolName: row.tool_name as ActionToolName,
    toolInput: JSON.parse(row.tool_input) as Record<string, unknown>,
    status: row.status as ActionStatus,
    result: row.result ? (JSON.parse(row.result) as ActionResult) : null,
    createdAt: row.created_at,
    executedAt: row.executed_at,
  };
}

export class ChatActionRepository {
  constructor(private readonly db: Database.Database) {}

  async insert(
    analysisId: string,
    toolName: ActionToolName,
    toolInput: Record<string, unknown>,
    chatMessageId?: string,
  ): Promise<ChatAction> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO chat_actions (id, analysis_id, chat_message_id, tool_name, tool_input, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(id, analysisId, chatMessageId ?? null, toolName, JSON.stringify(toolInput), now);
    return {
      id,
      analysisId,
      chatMessageId: chatMessageId ?? null,
      toolName,
      toolInput,
      status: 'pending',
      result: null,
      createdAt: now,
      executedAt: null,
    };
  }

  async findById(id: string): Promise<ChatAction | null> {
    const row = this.db
      .prepare(
        'SELECT id, analysis_id, chat_message_id, tool_name, tool_input, status, result, created_at, executed_at FROM chat_actions WHERE id = ?',
      )
      .get(id) as ChatActionRow | undefined;
    return row ? toDomain(row) : null;
  }

  async findByAnalysis(analysisId: string): Promise<ChatAction[]> {
    const rows = this.db
      .prepare(
        'SELECT id, analysis_id, chat_message_id, tool_name, tool_input, status, result, created_at, executed_at FROM chat_actions WHERE analysis_id = ? ORDER BY created_at ASC',
      )
      .all(analysisId) as ChatActionRow[];
    return rows.map(toDomain);
  }

  async updateStatus(
    id: string,
    status: ActionStatus,
    result?: ActionResult,
  ): Promise<void> {
    const executedAt =
      status === 'completed' || status === 'failed'
        ? new Date().toISOString()
        : null;
    this.db
      .prepare(
        'UPDATE chat_actions SET status = ?, result = ?, executed_at = COALESCE(?, executed_at) WHERE id = ?',
      )
      .run(status, result ? JSON.stringify(result) : null, executedAt, id);
  }

  async updateToolInput(
    id: string,
    toolInput: Record<string, unknown>,
  ): Promise<void> {
    this.db
      .prepare('UPDATE chat_actions SET tool_input = ? WHERE id = ?')
      .run(JSON.stringify(toolInput), id);
  }

  async deleteByAnalysis(analysisId: string): Promise<void> {
    this.db.prepare('DELETE FROM chat_actions WHERE analysis_id = ?').run(analysisId);
  }
}
