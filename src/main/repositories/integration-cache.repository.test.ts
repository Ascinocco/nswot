import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../../test/helpers/test-db';
import { IntegrationCacheRepository } from './integration-cache.repository';
import { IntegrationRepository } from './integration.repository';
import { WorkspaceRepository } from './workspace.repository';
import type { IntegrationCacheEntry, JiraConfig } from '../domain/types';

describe('IntegrationCacheRepository', () => {
  let db: Database.Database;
  let repo: IntegrationCacheRepository;
  let integrationId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    repo = new IntegrationCacheRepository(db);

    const workspaceRepo = new WorkspaceRepository(db);
    const workspace = await workspaceRepo.insert('/test/workspace', 'workspace');

    const integrationRepo = new IntegrationRepository(db);
    const config: JiraConfig = {
      cloudId: 'cloud-123',
      siteUrl: 'https://test.atlassian.net',
      selectedProjectKeys: [],
    };
    const integration = await integrationRepo.insert(workspace.id, 'jira', config, 'connected');
    integrationId = integration.id;
  });

  it('upserts and finds by type', async () => {
    await repo.upsert(integrationId, 'jira_project', 'PROJ', { key: 'PROJ', name: 'Project' });
    const entries = await repo.findByType(integrationId, 'jira_project');
    expect(entries).toHaveLength(1);
    expect((entries[0]!.data as { key: string }).key).toBe('PROJ');
  });

  it('upserts updates existing entry', async () => {
    await repo.upsert(integrationId, 'jira_project', 'PROJ', { key: 'PROJ', name: 'Original' });
    await repo.upsert(integrationId, 'jira_project', 'PROJ', { key: 'PROJ', name: 'Updated' });

    const entries = await repo.findByType(integrationId, 'jira_project');
    expect(entries).toHaveLength(1);
    expect((entries[0]!.data as { name: string }).name).toBe('Updated');
  });

  it('finds a single entry', async () => {
    await repo.upsert(integrationId, 'jira_story', 'PROJ-1', { summary: 'Story 1' });
    const entry = await repo.findEntry(integrationId, 'jira_story', 'PROJ-1');
    expect(entry).not.toBeNull();
    expect((entry!.data as { summary: string }).summary).toBe('Story 1');
  });

  it('returns null for nonexistent entry', async () => {
    const entry = await repo.findEntry(integrationId, 'jira_story', 'NONEXISTENT');
    expect(entry).toBeNull();
  });

  it('counts entries by integration', async () => {
    await repo.upsert(integrationId, 'jira_project', 'PROJ1', { key: 'PROJ1' });
    await repo.upsert(integrationId, 'jira_project', 'PROJ2', { key: 'PROJ2' });
    await repo.upsert(integrationId, 'jira_story', 'PROJ-1', { key: 'PROJ-1' });
    const count = await repo.countByIntegration(integrationId);
    expect(count).toBe(3);
  });

  it('prunes oldest entries when exceeding max', async () => {
    // Insert 10 entries with staggered timestamps
    for (let i = 0; i < 10; i++) {
      await repo.upsert(integrationId, 'jira_story', `PROJ-${i}`, { index: i });
    }

    // Prune to max 5
    await repo.pruneOldest(integrationId, 5);
    const count = await repo.countByIntegration(integrationId);
    expect(count).toBe(5);
  });

  it('does not prune when under limit', async () => {
    await repo.upsert(integrationId, 'jira_story', 'PROJ-1', { index: 1 });
    await repo.upsert(integrationId, 'jira_story', 'PROJ-2', { index: 2 });

    await repo.pruneOldest(integrationId, 5000);
    const count = await repo.countByIntegration(integrationId);
    expect(count).toBe(2);
  });

  it('deletes all cache entries for an integration', async () => {
    await repo.upsert(integrationId, 'jira_project', 'PROJ', { key: 'PROJ' });
    await repo.upsert(integrationId, 'jira_story', 'PROJ-1', { key: 'PROJ-1' });
    await repo.deleteByIntegration(integrationId);
    const count = await repo.countByIntegration(integrationId);
    expect(count).toBe(0);
  });

  describe('isStale', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns false for fresh entries', () => {
      const entry: IntegrationCacheEntry = {
        id: 'test',
        integrationId,
        resourceType: 'jira_project',
        resourceId: 'PROJ',
        data: {},
        fetchedAt: new Date().toISOString(),
      };
      expect(IntegrationCacheRepository.isStale(entry)).toBe(false);
    });

    it('returns true for entries older than TTL', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const entry: IntegrationCacheEntry = {
        id: 'test',
        integrationId,
        resourceType: 'jira_project',
        resourceId: 'PROJ',
        data: {},
        fetchedAt: twoHoursAgo,
      };
      expect(IntegrationCacheRepository.isStale(entry)).toBe(true);
    });

    it('respects custom TTL', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const entry: IntegrationCacheEntry = {
        id: 'test',
        integrationId,
        resourceType: 'jira_project',
        resourceId: 'PROJ',
        data: {},
        fetchedAt: fiveMinutesAgo,
      };
      // 10 minute TTL — not stale
      expect(IntegrationCacheRepository.isStale(entry, 10 * 60 * 1000)).toBe(false);
      // 1 minute TTL — stale
      expect(IntegrationCacheRepository.isStale(entry, 60 * 1000)).toBe(true);
    });
  });
});
