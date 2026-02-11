import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntegrationService } from './integration.service';
import { CircuitBreaker, CircuitOpenError } from '../infrastructure/circuit-breaker';
import type { IntegrationRepository } from '../repositories/integration.repository';
import type { IntegrationCacheRepository } from '../repositories/integration-cache.repository';
import type { WorkspaceService } from './workspace.service';
import type { JiraProvider } from '../providers/jira/jira.provider';
import type { SecureStorage } from '../infrastructure/safe-storage';
import type { PreferencesRepository } from '../repositories/preferences.repository';
import type { Integration, JiraConfig } from '../domain/types';

// Mock retry to execute without delays
vi.mock('../infrastructure/retry', () => ({
  withRetry: vi.fn((fn: () => unknown) => fn()),
}));

// Mock JiraAuthProvider
vi.mock('../providers/jira/jira-auth', () => ({
  JiraAuthProvider: vi.fn().mockImplementation(() => ({
    initiateOAuthFlow: vi.fn().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 3600000,
      scope: 'read:jira-work offline_access',
    }),
    refreshAccessToken: vi.fn().mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: Date.now() + 3600000,
      scope: 'read:jira-work offline_access',
    }),
  })),
}));

function createMockWorkspaceService(): WorkspaceService {
  return {
    getCurrentId: vi.fn(() => 'workspace-1'),
    getCurrentPath: vi.fn(() => '/test/workspace'),
    getCurrent: vi.fn(),
    open: vi.fn(),
  } as unknown as WorkspaceService;
}

function createMockIntegrationRepo(): IntegrationRepository {
  return {
    findByWorkspaceAndProvider: vi.fn(async () => null),
    insert: vi.fn(async (_wId: string, _provider: string, config: JiraConfig, status: string) => ({
      id: 'integration-1',
      workspaceId: 'workspace-1',
      provider: 'jira' as const,
      config,
      status,
      lastSyncedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    updateConfig: vi.fn(),
    updateStatus: vi.fn(),
    updateLastSynced: vi.fn(),
    delete: vi.fn(),
  } as unknown as IntegrationRepository;
}

function createMockCacheRepo(): IntegrationCacheRepository {
  return {
    findByType: vi.fn(async () => []),
    findEntry: vi.fn(async () => null),
    upsert: vi.fn(),
    countByIntegration: vi.fn(async () => 0),
    pruneOldest: vi.fn(),
    deleteByIntegration: vi.fn(),
  } as unknown as IntegrationCacheRepository;
}

function createMockJiraProvider(): JiraProvider {
  return {
    fetchAccessibleResources: vi.fn(async () => [
      { id: 'cloud-123', url: 'https://test.atlassian.net', name: 'Test', scopes: [] },
    ]),
    fetchProjects: vi.fn(async () => [
      { id: '1', key: 'PROJ', name: 'Project', projectTypeKey: 'software' },
    ]),
    fetchIssues: vi.fn(async () => ({
      issues: [],
    })),
    fetchComments: vi.fn(async () => ({
      startAt: 0,
      maxResults: 50,
      total: 0,
      comments: [],
    })),
    fetchChangelog: vi.fn(async () => ({
      startAt: 0,
      maxResults: 50,
      total: 0,
      values: [],
    })),
  } as unknown as JiraProvider;
}

function createMockSecureStorage(): SecureStorage & { _store: Map<string, string> } {
  const _store = new Map<string, string>();
  return {
    _store,
    store: vi.fn((key: string, value: string) => {
      _store.set(key, value);
    }),
    retrieve: vi.fn((key: string) => _store.get(key) ?? null),
    remove: vi.fn((key: string) => {
      _store.delete(key);
    }),
    isAvailable: vi.fn(() => true),
  };
}

function createMockPreferencesRepo(): PreferencesRepository {
  return {
    get: vi.fn(async () => null),
    set: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(async () => ({})),
  } as unknown as PreferencesRepository;
}

describe('IntegrationService', () => {
  let service: IntegrationService;
  let integrationRepo: ReturnType<typeof createMockIntegrationRepo>;
  let cacheRepo: ReturnType<typeof createMockCacheRepo>;
  let workspaceService: ReturnType<typeof createMockWorkspaceService>;
  let jiraProvider: ReturnType<typeof createMockJiraProvider>;
  let circuitBreaker: CircuitBreaker;
  let secureStorage: ReturnType<typeof createMockSecureStorage>;
  let preferencesRepo: ReturnType<typeof createMockPreferencesRepo>;

  beforeEach(() => {
    integrationRepo = createMockIntegrationRepo();
    cacheRepo = createMockCacheRepo();
    workspaceService = createMockWorkspaceService();
    jiraProvider = createMockJiraProvider();
    circuitBreaker = new CircuitBreaker();
    secureStorage = createMockSecureStorage();
    preferencesRepo = createMockPreferencesRepo();

    service = new IntegrationService(
      integrationRepo,
      cacheRepo,
      workspaceService,
      jiraProvider,
      circuitBreaker,
      secureStorage,
      preferencesRepo,
    );
  });

  describe('getIntegration', () => {
    it('returns null when no integration exists', async () => {
      const result = await service.getIntegration();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('returns error when no workspace is open', async () => {
      vi.mocked(workspaceService.getCurrentId).mockReturnValue(null);
      const result = await service.getIntegration();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WORKSPACE_NOT_FOUND');
      }
    });

    it('returns existing integration', async () => {
      const integration: Integration = {
        id: 'integration-1',
        workspaceId: 'workspace-1',
        provider: 'jira',
        config: { cloudId: 'cloud-123', siteUrl: 'https://test.atlassian.net', selectedProjectKeys: [] },
        status: 'connected',
        lastSyncedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(integrationRepo.findByWorkspaceAndProvider).mockResolvedValue(integration);

      const result = await service.getIntegration();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.id).toBe('integration-1');
      }
    });
  });

  describe('connectJira', () => {
    it('runs OAuth flow and creates integration', async () => {
      const result = await service.connectJira('client-id', 'client-secret');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('connected');
        expect((result.value.config as { cloudId: string }).cloudId).toBe('cloud-123');
      }

      // Tokens stored securely
      expect(secureStorage.store).toHaveBeenCalledWith(
        'jira_tokens_workspace-1',
        expect.any(String),
      );
      expect(secureStorage.store).toHaveBeenCalledWith(
        'jira_oauth_workspace-1',
        expect.any(String),
      );
    });

    it('updates existing integration on reconnect', async () => {
      const existing: Integration = {
        id: 'integration-1',
        workspaceId: 'workspace-1',
        provider: 'jira',
        config: { cloudId: 'old-cloud', siteUrl: 'https://old.atlassian.net', selectedProjectKeys: [] },
        status: 'disconnected',
        lastSyncedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(integrationRepo.findByWorkspaceAndProvider).mockResolvedValue(existing);

      const result = await service.connectJira('client-id', 'client-secret');
      expect(result.ok).toBe(true);
      expect(integrationRepo.updateConfig).toHaveBeenCalled();
      expect(integrationRepo.updateStatus).toHaveBeenCalledWith('integration-1', 'connected');
    });

    it('returns error when no accessible resources found', async () => {
      vi.mocked(jiraProvider.fetchAccessibleResources).mockResolvedValue([]);
      const result = await service.connectJira('client-id', 'client-secret');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('JIRA_AUTH_FAILED');
      }
    });
  });

  describe('disconnect', () => {
    it('clears tokens and sets status to disconnected', async () => {
      const integration: Integration = {
        id: 'integration-1',
        workspaceId: 'workspace-1',
        provider: 'jira',
        config: { cloudId: 'cloud-123', siteUrl: 'https://test.atlassian.net', selectedProjectKeys: [] },
        status: 'connected',
        lastSyncedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(integrationRepo.findByWorkspaceAndProvider).mockResolvedValue(integration);

      const result = await service.disconnect();
      expect(result.ok).toBe(true);
      expect(secureStorage.remove).toHaveBeenCalledWith('jira_tokens_workspace-1');
      expect(secureStorage.remove).toHaveBeenCalledWith('jira_oauth_workspace-1');
      expect(cacheRepo.deleteByIntegration).toHaveBeenCalledWith('integration-1');
      expect(integrationRepo.updateStatus).toHaveBeenCalledWith('integration-1', 'disconnected');
    });
  });

  describe('listProjects', () => {
    it('fetches projects from Jira', async () => {
      const integration: Integration = {
        id: 'integration-1',
        workspaceId: 'workspace-1',
        provider: 'jira',
        config: { cloudId: 'cloud-123', siteUrl: 'https://test.atlassian.net', selectedProjectKeys: [] },
        status: 'connected',
        lastSyncedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(integrationRepo.findByWorkspaceAndProvider).mockResolvedValue(integration);

      // Store tokens
      secureStorage.store(
        'jira_tokens_workspace-1',
        JSON.stringify({
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 3600000,
          scope: 'read:jira-work',
        }),
      );

      const result = await service.listProjects();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.key).toBe('PROJ');
      }
    });

    it('returns error when not connected', async () => {
      const result = await service.listProjects();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('JIRA_AUTH_FAILED');
      }
    });
  });

  describe('sync', () => {
    const connectedIntegration: Integration = {
      id: 'integration-1',
      workspaceId: 'workspace-1',
      provider: 'jira',
      config: { cloudId: 'cloud-123', siteUrl: 'https://test.atlassian.net', selectedProjectKeys: [] },
      status: 'connected',
      lastSyncedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    beforeEach(() => {
      vi.mocked(integrationRepo.findByWorkspaceAndProvider).mockResolvedValue(connectedIntegration);
      secureStorage.store(
        'jira_tokens_workspace-1',
        JSON.stringify({
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 3600000,
          scope: 'read:jira-work',
        }),
      );
    });

    it('syncs epics, stories, and comments', async () => {
      vi.mocked(jiraProvider.fetchIssues)
        .mockResolvedValueOnce({
          issues: [{
            id: '1', key: 'PROJ-1',
            fields: {
              summary: 'Epic 1', description: null, issuetype: { name: 'Epic' },
              status: { name: 'Open' }, priority: null, assignee: null, reporter: null,
              labels: [], created: '2024-01-01', updated: '2024-01-02',
            },
          }],
        })
        .mockResolvedValueOnce({
          issues: [{
            id: '2', key: 'PROJ-2',
            fields: {
              summary: 'Story 1', description: null, issuetype: { name: 'Story' },
              status: { name: 'Open' }, priority: null, assignee: null, reporter: null,
              labels: [], created: '2024-01-01', updated: '2024-01-02',
            },
          }],
        });

      vi.mocked(jiraProvider.fetchComments).mockResolvedValueOnce({
        startAt: 0,
        maxResults: 50,
        total: 1,
        comments: [{
          id: 'c1', body: 'A comment',
          author: { displayName: 'User' },
          created: '2024-01-01', updated: '2024-01-01',
        }],
      });

      const result = await service.sync(['PROJ']);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.syncedCount).toBe(3); // 1 epic + 1 story + 1 comment
      }

      expect(cacheRepo.upsert).toHaveBeenCalledTimes(3);
      expect(cacheRepo.pruneOldest).toHaveBeenCalledWith('integration-1', 5000);
      expect(integrationRepo.updateLastSynced).toHaveBeenCalledWith('integration-1');
    });

    it('returns warning with stale cache on partial failure', async () => {
      vi.mocked(jiraProvider.fetchIssues).mockRejectedValue(
        Object.assign(new Error('Server error'), { status: 500 }),
      );
      vi.mocked(cacheRepo.countByIntegration).mockResolvedValue(10);

      const result = await service.sync(['PROJ']);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.warning).toContain('Sync partially failed');
      }
      expect(integrationRepo.updateStatus).toHaveBeenCalledWith('integration-1', 'error');
    });

    it('returns error when no stale cache available', async () => {
      vi.mocked(jiraProvider.fetchIssues).mockRejectedValue(
        Object.assign(new Error('Server error'), { status: 500 }),
      );
      vi.mocked(cacheRepo.countByIntegration).mockResolvedValue(0);

      const result = await service.sync(['PROJ']);
      expect(result.ok).toBe(false);
    });
  });

  describe('error mapping', () => {
    it('maps CircuitOpenError to CIRCUIT_OPEN', async () => {
      const integration: Integration = {
        id: 'integration-1',
        workspaceId: 'workspace-1',
        provider: 'jira',
        config: { cloudId: 'cloud-123', siteUrl: 'https://test.atlassian.net', selectedProjectKeys: [] },
        status: 'connected',
        lastSyncedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(integrationRepo.findByWorkspaceAndProvider).mockResolvedValue(integration);
      secureStorage.store(
        'jira_tokens_workspace-1',
        JSON.stringify({
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 3600000,
          scope: 'read:jira-work',
        }),
      );
      vi.mocked(jiraProvider.fetchProjects).mockRejectedValue(
        new CircuitOpenError('Circuit is open'),
      );

      const result = await service.listProjects();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CIRCUIT_OPEN');
      }
    });

    it('maps 401 to JIRA_AUTH_FAILED', async () => {
      const integration: Integration = {
        id: 'integration-1',
        workspaceId: 'workspace-1',
        provider: 'jira',
        config: { cloudId: 'cloud-123', siteUrl: 'https://test.atlassian.net', selectedProjectKeys: [] },
        status: 'connected',
        lastSyncedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(integrationRepo.findByWorkspaceAndProvider).mockResolvedValue(integration);
      secureStorage.store(
        'jira_tokens_workspace-1',
        JSON.stringify({
          accessToken: 'bad-token',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 3600000,
          scope: 'read:jira-work',
        }),
      );
      vi.mocked(jiraProvider.fetchProjects).mockRejectedValue(
        Object.assign(new Error('Unauthorized'), { status: 401 }),
      );

      const result = await service.listProjects();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('JIRA_AUTH_FAILED');
      }
    });

    it('maps 429 to JIRA_RATE_LIMITED', async () => {
      const integration: Integration = {
        id: 'integration-1',
        workspaceId: 'workspace-1',
        provider: 'jira',
        config: { cloudId: 'cloud-123', siteUrl: 'https://test.atlassian.net', selectedProjectKeys: [] },
        status: 'connected',
        lastSyncedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(integrationRepo.findByWorkspaceAndProvider).mockResolvedValue(integration);
      secureStorage.store(
        'jira_tokens_workspace-1',
        JSON.stringify({
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 3600000,
          scope: 'read:jira-work',
        }),
      );
      vi.mocked(jiraProvider.fetchProjects).mockRejectedValue(
        Object.assign(new Error('Rate limited'), { status: 429 }),
      );

      const result = await service.listProjects();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('JIRA_RATE_LIMITED');
      }
    });
  });
});
