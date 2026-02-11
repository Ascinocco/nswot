import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { Integration, IntegrationConfig, IntegrationProvider } from '../domain/types';

interface IntegrationRow {
  id: string;
  workspace_id: string;
  provider: string;
  config: string;
  status: string;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

function toDomain(row: IntegrationRow): Integration {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: row.provider as IntegrationProvider,
    config: JSON.parse(row.config) as IntegrationConfig,
    status: row.status as 'disconnected' | 'connected' | 'error',
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class IntegrationRepository {
  constructor(private readonly db: Database.Database) {}

  async findAllByWorkspace(workspaceId: string): Promise<Integration[]> {
    const rows = this.db
      .prepare(
        'SELECT id, workspace_id, provider, config, status, last_synced_at, created_at, updated_at FROM integrations WHERE workspace_id = ?',
      )
      .all(workspaceId) as IntegrationRow[];
    return rows.map(toDomain);
  }

  async findByWorkspaceAndProvider(
    workspaceId: string,
    provider: string,
  ): Promise<Integration | null> {
    const row = this.db
      .prepare(
        'SELECT id, workspace_id, provider, config, status, last_synced_at, created_at, updated_at FROM integrations WHERE workspace_id = ? AND provider = ?',
      )
      .get(workspaceId, provider) as IntegrationRow | undefined;
    return row ? toDomain(row) : null;
  }

  async insert(
    workspaceId: string,
    provider: string,
    config: IntegrationConfig,
    status: string,
  ): Promise<Integration> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const configJson = JSON.stringify(config);
    this.db
      .prepare(
        'INSERT INTO integrations (id, workspace_id, provider, config, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, workspaceId, provider, configJson, status, now, now);
    return {
      id,
      workspaceId,
      provider: provider as IntegrationProvider,
      config,
      status: status as 'disconnected' | 'connected' | 'error',
      lastSyncedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateConfig(id: string, config: IntegrationConfig): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE integrations SET config = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(config), now, id);
  }

  async updateStatus(id: string, status: string): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE integrations SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, id);
  }

  async updateLastSynced(id: string): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE integrations SET last_synced_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM integrations WHERE id = ?').run(id);
  }
}
