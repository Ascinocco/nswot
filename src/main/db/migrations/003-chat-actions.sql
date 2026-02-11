-- Migration 003: Chat Actions
-- This file is a documentation reference. The actual migration is executed
-- from src/main/db/migrations.ts as a TypeScript string to avoid bundler
-- path resolution issues.

CREATE TABLE IF NOT EXISTS chat_actions (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  chat_message_id TEXT REFERENCES chat_messages(id),
  tool_name TEXT NOT NULL,           -- e.g., 'create_jira_issue'
  tool_input TEXT NOT NULL,          -- JSON: the tool call arguments
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'executing', 'completed', 'failed', 'rejected')),
  result TEXT,                       -- JSON: ActionResult
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  executed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_chat_actions_analysis_id ON chat_actions(analysis_id);
CREATE INDEX IF NOT EXISTS idx_chat_actions_status ON chat_actions(status);
