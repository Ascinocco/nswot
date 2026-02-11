import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../../test/helpers/test-db';
import { IntegrationRepository } from './integration.repository';
import { WorkspaceRepository } from './workspace.repository';
import type { JiraConfig } from '../domain/types';

describe('IntegrationRepository', () => {
  let db: Database.Database;
  let repo: IntegrationRepository;
  let workspaceId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    repo = new IntegrationRepository(db);
    const workspaceRepo = new WorkspaceRepository(db);
    const workspace = await workspaceRepo.insert('/test/workspace', 'workspace');
    workspaceId = workspace.id;
  });

  const jiraConfig: JiraConfig = {
    cloudId: 'cloud-123',
    siteUrl: 'https://test.atlassian.net',
    selectedProjectKeys: ['PROJ'],
  };

  it('inserts and finds by workspace and provider', async () => {
    await repo.insert(workspaceId, 'jira', jiraConfig, 'connected');
    const found = await repo.findByWorkspaceAndProvider(workspaceId, 'jira');
    expect(found).not.toBeNull();
    expect(found!.provider).toBe('jira');
    expect(found!.config.cloudId).toBe('cloud-123');
    expect(found!.status).toBe('connected');
  });

  it('returns null for nonexistent integration', async () => {
    const found = await repo.findByWorkspaceAndProvider(workspaceId, 'jira');
    expect(found).toBeNull();
  });

  it('updates config', async () => {
    const integration = await repo.insert(workspaceId, 'jira', jiraConfig, 'connected');
    const newConfig: JiraConfig = { ...jiraConfig, selectedProjectKeys: ['PROJ', 'PROJ2'] };
    await repo.updateConfig(integration.id, newConfig);
    const found = await repo.findByWorkspaceAndProvider(workspaceId, 'jira');
    expect(found!.config.selectedProjectKeys).toEqual(['PROJ', 'PROJ2']);
  });

  it('updates status', async () => {
    const integration = await repo.insert(workspaceId, 'jira', jiraConfig, 'connected');
    await repo.updateStatus(integration.id, 'error');
    const found = await repo.findByWorkspaceAndProvider(workspaceId, 'jira');
    expect(found!.status).toBe('error');
  });

  it('updates last synced timestamp', async () => {
    const integration = await repo.insert(workspaceId, 'jira', jiraConfig, 'connected');
    expect(integration.lastSyncedAt).toBeNull();
    await repo.updateLastSynced(integration.id);
    const found = await repo.findByWorkspaceAndProvider(workspaceId, 'jira');
    expect(found!.lastSyncedAt).not.toBeNull();
  });

  it('deletes an integration', async () => {
    const integration = await repo.insert(workspaceId, 'jira', jiraConfig, 'connected');
    await repo.delete(integration.id);
    const found = await repo.findByWorkspaceAndProvider(workspaceId, 'jira');
    expect(found).toBeNull();
  });

  it('cascades delete to cache entries', async () => {
    const integration = await repo.insert(workspaceId, 'jira', jiraConfig, 'connected');
    // Insert a cache entry directly
    db.prepare(
      'INSERT INTO integration_cache (id, integration_id, resource_type, resource_id, data) VALUES (?, ?, ?, ?, ?)',
    ).run('cache-1', integration.id, 'jira_project', 'PROJ', '{}');

    await repo.delete(integration.id);
    const cacheCount = db
      .prepare('SELECT COUNT(*) as count FROM integration_cache WHERE integration_id = ?')
      .get(integration.id) as { count: number };
    expect(cacheCount.count).toBe(0);
  });
});
