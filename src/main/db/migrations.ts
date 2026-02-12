export interface Migration {
  version: number;
  description: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema — workspaces, profiles, integrations, analyses, chat, preferences',
    sql: `
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_opened_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        role TEXT,
        team TEXT,
        concerns TEXT,
        priorities TEXT,
        interview_quotes TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        source_file TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_profiles_workspace_id ON profiles(workspace_id);

      CREATE TABLE IF NOT EXISTS integrations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        config TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'disconnected',
        last_synced_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_integrations_workspace_id ON integrations(workspace_id);

      CREATE TABLE IF NOT EXISTS integration_cache (
        id TEXT PRIMARY KEY,
        integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_integration_cache_integration_id ON integration_cache(integration_id);

      CREATE TABLE IF NOT EXISTS analyses (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        model_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        config TEXT NOT NULL DEFAULT '{}',
        input_snapshot TEXT,
        swot_output TEXT,
        summaries_output TEXT,
        raw_llm_response TEXT,
        warning TEXT,
        error TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_analyses_workspace_id ON analyses(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);

      CREATE TABLE IF NOT EXISTS analysis_profiles (
        analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        anonymized_label TEXT NOT NULL,
        PRIMARY KEY (analysis_id, profile_id)
      );
      CREATE INDEX IF NOT EXISTS idx_analysis_profiles_analysis_id ON analysis_profiles(analysis_id);

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_chat_messages_analysis_id ON chat_messages(analysis_id);

      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    description: 'Add quality_metrics column to analyses',
    sql: `
      ALTER TABLE analyses ADD COLUMN quality_metrics TEXT;
    `,
  },
  {
    version: 3,
    description: 'Add chat_actions table for chat action audit trail',
    sql: `
      CREATE TABLE IF NOT EXISTS chat_actions (
        id TEXT PRIMARY KEY,
        analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
        chat_message_id TEXT REFERENCES chat_messages(id),
        tool_name TEXT NOT NULL,
        tool_input TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'executing', 'completed', 'failed', 'rejected')),
        result TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        executed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_chat_actions_analysis_id ON chat_actions(analysis_id);
      CREATE INDEX IF NOT EXISTS idx_chat_actions_status ON chat_actions(status);
    `,
  },
  {
    version: 4,
    description: 'Add themes table for extracted analysis themes',
    sql: `
      CREATE TABLE IF NOT EXISTS themes (
        id TEXT PRIMARY KEY,
        analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        description TEXT NOT NULL,
        evidence_refs TEXT NOT NULL DEFAULT '[]',
        source_types TEXT NOT NULL DEFAULT '[]',
        frequency INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_themes_analysis_id ON themes(analysis_id);
    `,
  },
  {
    version: 5,
    description: 'Add tags column to profiles for categorization',
    sql: `
      ALTER TABLE profiles ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
    `,
  },
];
