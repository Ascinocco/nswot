import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodebaseService } from './codebase.service';
import type { IntegrationRepository } from '../repositories/integration.repository';
import type { IntegrationCacheRepository } from '../repositories/integration-cache.repository';
import type { WorkspaceService } from './workspace.service';
import type { CodebaseProvider } from '../providers/codebase/codebase.provider';
import type { SecureStorage } from '../infrastructure/safe-storage';
import type { Integration, CodebaseConfig } from '../domain/types';
import type { CodebaseAnalysis, CodebasePrerequisites } from '../providers/codebase/codebase.types';
import type { CodebaseProgress } from './codebase.service';
import { ok } from '../domain/result';

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
}));

vi.mock('fs/promises', () => ({
  rm: vi.fn(async () => undefined),
}));

vi.mock('../infrastructure/file-system', () => ({
  validateWorkspacePath: vi.fn((root: string, rel: string) => `${root}/${rel}`),
}));

const VALID_ANALYSIS: CodebaseAnalysis = {
  repo: 'owner/repo',
  analyzedAt: '2024-01-01T00:00:00.000Z',
  architecture: { summary: 'Clean', modules: ['api'], concerns: [] },
  quality: { summary: 'Good', strengths: ['tests'], weaknesses: [] },
  technicalDebt: { summary: 'Low', items: [] },
  risks: { summary: 'Low', items: [] },
  jiraCrossReference: null,
};

const ALL_PREREQS: CodebasePrerequisites = {
  cli: true,
  cliAuthenticated: true,
  git: true,
  jiraMcp: false,
};

function createMockWorkspaceService(): WorkspaceService {
  return {
    getCurrentId: vi.fn(() => 'workspace-1'),
    getCurrentPath: vi.fn(() => '/test/workspace'),
    getCurrent: vi.fn(async () => ok({
      id: 'workspace-1',
      path: '/test/workspace',
      name: 'Test',
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    })),
    open: vi.fn(),
  } as unknown as WorkspaceService;
}

function createMockIntegrationRepo(): IntegrationRepository {
  const codebaseIntegration: Integration = {
    id: 'codebase-int-1',
    workspaceId: 'workspace-1',
    provider: 'codebase',
    config: { selectedRepos: [] } as CodebaseConfig,
    status: 'connected',
    lastSyncedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    findByWorkspaceAndProvider: vi.fn(async () => codebaseIntegration),
    insert: vi.fn(async (_wId: string, _provider: string, config: CodebaseConfig, status: string) => ({
      id: 'codebase-int-1',
      workspaceId: 'workspace-1',
      provider: 'codebase' as const,
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

function createMockCodebaseProvider(): CodebaseProvider {
  return {
    checkPrerequisites: vi.fn(async () => ({ ...ALL_PREREQS })),
    cloneOrPull: vi.fn(async () => undefined),
    analyze: vi.fn(async () => ({ ...VALID_ANALYSIS })),
    parseOutput: vi.fn(),
  } as unknown as CodebaseProvider;
}

function createMockSecureStorage(): SecureStorage {
  const _store = new Map<string, string>();
  _store.set('github_pat_workspace-1', 'ghp_test_pat');
  return {
    store: vi.fn((key: string, value: string) => _store.set(key, value)),
    retrieve: vi.fn((key: string) => _store.get(key) ?? null),
    remove: vi.fn((key: string) => { _store.delete(key); }),
    isAvailable: vi.fn(() => true),
  } as unknown as SecureStorage;
}

describe('CodebaseService', () => {
  let service: CodebaseService;
  let integrationRepo: ReturnType<typeof createMockIntegrationRepo>;
  let cacheRepo: ReturnType<typeof createMockCacheRepo>;
  let workspaceService: ReturnType<typeof createMockWorkspaceService>;
  let codebaseProvider: ReturnType<typeof createMockCodebaseProvider>;
  let secureStorage: ReturnType<typeof createMockSecureStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    integrationRepo = createMockIntegrationRepo();
    cacheRepo = createMockCacheRepo();
    workspaceService = createMockWorkspaceService();
    codebaseProvider = createMockCodebaseProvider();
    secureStorage = createMockSecureStorage();

    service = new CodebaseService(
      integrationRepo,
      cacheRepo,
      workspaceService,
      codebaseProvider,
      secureStorage,
    );
  });

  describe('checkPrerequisites', () => {
    it('returns prerequisites from provider', async () => {
      const result = await service.checkPrerequisites();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.cli).toBe(true);
        expect(result.value.git).toBe(true);
      }
    });

    it('returns error when provider throws', async () => {
      vi.mocked(codebaseProvider.checkPrerequisites).mockRejectedValue(new Error('exec failed'));
      const result = await service.checkPrerequisites();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('analyzeRepos', () => {
    const onProgress = vi.fn<(progress: CodebaseProgress) => void>();

    beforeEach(() => {
      onProgress.mockReset();
    });

    it('analyzes repos end-to-end: clone, analyze, cache', async () => {
      const result = await service.analyzeRepos(
        ['owner/repo'],
        {},
        [],
        onProgress,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.results).toHaveLength(1);
        expect(result.value.results[0]!.repo).toBe('owner/repo');
        expect(result.value.failures).toHaveLength(0);
      }

      // Verify clone was called
      expect(codebaseProvider.cloneOrPull).toHaveBeenCalledWith(
        'owner/repo',
        expect.stringContaining('owner/repo'),
        'ghp_test_pat',
        true,
      );

      // Verify analysis was called
      expect(codebaseProvider.analyze).toHaveBeenCalledWith(
        expect.stringContaining('owner/repo'),
        expect.stringContaining('owner/repo'), // prompt contains repo name
        expect.objectContaining({ model: 'sonnet' }),
      );

      // Verify cached
      expect(cacheRepo.upsert).toHaveBeenCalledWith(
        'codebase-int-1',
        'codebase_analysis',
        'owner/repo',
        expect.objectContaining({ repo: 'owner/repo' }),
      );

      // Verify integration status updated
      expect(integrationRepo.updateStatus).toHaveBeenCalledWith('codebase-int-1', 'connected');
      expect(integrationRepo.updateLastSynced).toHaveBeenCalledWith('codebase-int-1');

      // Verify progress events
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ repo: 'owner/repo', stage: 'cloning' }),
      );
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ repo: 'owner/repo', stage: 'analyzing' }),
      );
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ repo: 'owner/repo', stage: 'done' }),
      );
    });

    it('handles partial failure: 2/3 succeed, 1 fails', async () => {
      vi.mocked(codebaseProvider.analyze)
        .mockResolvedValueOnce({ ...VALID_ANALYSIS, repo: 'owner/repo1' })
        .mockRejectedValueOnce(new Error('Claude CLI error'))
        .mockResolvedValueOnce({ ...VALID_ANALYSIS, repo: 'owner/repo3' });

      const result = await service.analyzeRepos(
        ['owner/repo1', 'owner/repo2', 'owner/repo3'],
        {},
        [],
        onProgress,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.results).toHaveLength(2);
        expect(result.value.failures).toHaveLength(1);
        expect(result.value.failures[0]!.repo).toBe('owner/repo2');
        expect(result.value.failures[0]!.error).toContain('owner/repo2');
      }

      // Verify failed progress
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ repo: 'owner/repo2', stage: 'failed' }),
      );
    });

    it('retries once on parse error', async () => {
      const parseError = Object.assign(new Error('Failed to parse'), { parseError: true });
      vi.mocked(codebaseProvider.analyze)
        .mockRejectedValueOnce(parseError)
        .mockResolvedValueOnce({ ...VALID_ANALYSIS });

      const result = await service.analyzeRepos(
        ['owner/repo'],
        {},
        [],
        onProgress,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.results).toHaveLength(1);
        expect(result.value.failures).toHaveLength(0);
      }

      // Should have been called twice (original + retry)
      expect(codebaseProvider.analyze).toHaveBeenCalledTimes(2);
    });

    it('returns error when no workspace is open', async () => {
      vi.mocked(workspaceService.getCurrentId).mockReturnValue(null);

      const result = await service.analyzeRepos(
        ['owner/repo'],
        {},
        [],
        onProgress,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WORKSPACE_NOT_FOUND');
      }
    });

    it('returns error when GitHub PAT is missing', async () => {
      vi.mocked(secureStorage.retrieve).mockReturnValue(null);

      const result = await service.analyzeRepos(
        ['owner/repo'],
        {},
        [],
        onProgress,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CODEBASE_CLONE_FAILED');
        expect(result.error.message).toContain('GitHub is not connected');
      }
    });

    it('returns error when Claude CLI is not found', async () => {
      vi.mocked(codebaseProvider.checkPrerequisites).mockResolvedValue({
        cli: false,
        cliAuthenticated: false,
        git: true,
        jiraMcp: false,
      });

      const result = await service.analyzeRepos(
        ['owner/repo'],
        {},
        [],
        onProgress,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CODEBASE_CLI_NOT_FOUND');
      }
    });

    it('returns error when Claude CLI is not authenticated', async () => {
      vi.mocked(codebaseProvider.checkPrerequisites).mockResolvedValue({
        cli: true,
        cliAuthenticated: false,
        git: true,
        jiraMcp: false,
      });

      const result = await service.analyzeRepos(
        ['owner/repo'],
        {},
        [],
        onProgress,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CODEBASE_CLI_NOT_AUTHENTICATED');
      }
    });

    it('returns error when git is not found', async () => {
      vi.mocked(codebaseProvider.checkPrerequisites).mockResolvedValue({
        cli: true,
        cliAuthenticated: true,
        git: false,
        jiraMcp: false,
      });

      const result = await service.analyzeRepos(
        ['owner/repo'],
        {},
        [],
        onProgress,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CODEBASE_GIT_NOT_FOUND');
      }
    });

    it('creates integration record on first use', async () => {
      vi.mocked(integrationRepo.findByWorkspaceAndProvider).mockResolvedValue(null);

      const result = await service.analyzeRepos(
        ['owner/repo'],
        {},
        [],
        onProgress,
      );

      expect(result.ok).toBe(true);
      expect(integrationRepo.insert).toHaveBeenCalledWith(
        'workspace-1',
        'codebase',
        expect.objectContaining({ selectedRepos: [] }),
        'connected',
      );
    });

    it('reports timeout error message', async () => {
      const timeoutError = Object.assign(new Error('timeout'), { timeout: true });
      vi.mocked(codebaseProvider.analyze).mockRejectedValue(timeoutError);

      const result = await service.analyzeRepos(
        ['owner/repo'],
        {},
        [],
        onProgress,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.failures).toHaveLength(1);
        expect(result.value.failures[0]!.error).toContain('timed out');
      }
    });
  });

  describe('getCachedAnalysis', () => {
    it('returns cached analysis when available', async () => {
      vi.mocked(cacheRepo.findEntry).mockResolvedValue({
        id: 'cache-1',
        integrationId: 'codebase-int-1',
        resourceType: 'codebase_analysis',
        resourceId: 'owner/repo',
        data: VALID_ANALYSIS,
        fetchedAt: new Date().toISOString(),
      });

      const result = await service.getCachedAnalysis('owner/repo');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value!.repo).toBe('owner/repo');
      }
    });

    it('returns null when no cached analysis exists', async () => {
      const result = await service.getCachedAnalysis('owner/repo');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('returns null when no codebase integration exists', async () => {
      vi.mocked(integrationRepo.findByWorkspaceAndProvider).mockResolvedValue(null);

      const result = await service.getCachedAnalysis('owner/repo');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('returns error when no workspace is open', async () => {
      vi.mocked(workspaceService.getCurrentId).mockReturnValue(null);

      const result = await service.getCachedAnalysis('owner/repo');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WORKSPACE_NOT_FOUND');
      }
    });
  });

  describe('clearClonedRepos', () => {
    it('removes repos directory and clears cache', async () => {
      const { rm } = await import('fs/promises');
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await service.clearClonedRepos();
      expect(result.ok).toBe(true);

      expect(rm).toHaveBeenCalledWith(
        expect.stringContaining('.nswot/repos'),
        expect.objectContaining({ recursive: true, force: true }),
      );

      expect(cacheRepo.deleteByIntegration).toHaveBeenCalledWith('codebase-int-1');
    });

    it('succeeds even when repos directory does not exist', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await service.clearClonedRepos();
      expect(result.ok).toBe(true);
    });

    it('returns error when no workspace is open', async () => {
      vi.mocked(workspaceService.getCurrent).mockResolvedValue(ok(null));

      const result = await service.clearClonedRepos();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WORKSPACE_NOT_FOUND');
      }
    });
  });
});
