-- Migration 006: Phase 4 — Chat-Driven Agent Experience
-- This file is a documentation reference. The actual migration is executed
-- from src/main/db/migrations.ts as a TypeScript string to avoid bundler
-- path resolution issues.

-- Conversations table: first-class conversation entities
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_id ON conversations(workspace_id);

-- Link analyses to conversations (nullable for pre-Phase 4 analyses)
ALTER TABLE analyses ADD COLUMN conversation_id TEXT REFERENCES conversations(id);

-- Link re-run analyses to their parent (nullable — only set on re-runs)
ALTER TABLE analyses ADD COLUMN parent_analysis_id TEXT;

-- Content format for chat messages: 'text' (plain string) or 'blocks' (JSON ContentBlock[])
ALTER TABLE chat_messages ADD COLUMN content_format TEXT NOT NULL DEFAULT 'text'
  CHECK (content_format IN ('text', 'blocks'));

-- Approval memory: per-conversation tool approval decisions
CREATE TABLE IF NOT EXISTS approval_memory (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, tool_name)
);
