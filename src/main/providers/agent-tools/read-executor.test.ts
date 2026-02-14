import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReadExecutor } from './read-executor';
import type { IntegrationRepository } from '../../repositories/integration.repository';
import type { IntegrationCacheRepository } from '../../repositories/integration-cache.repository';
import type { ProfileRepository } from '../../repositories/profile.repository';
import type { WorkspaceService } from '../../services/workspace.service';
import type { Integration, IntegrationCacheEntry, Profile } from '../../domain/types';

// --- Mock Factories ---

function makeMockWorkspaceService(workspaceId: string | null = 'ws-1'): WorkspaceService {
  return {
    getCurrentId: vi.fn(() => workspaceId),
  } as unknown as WorkspaceService;
}

function makeIntegration(provider: string, status = 'connected'): Integration {
  return {
    id: `int-${provider}`,
    workspaceId: 'ws-1',
    provider,
    config: { selectedProjectKeys: ['PROJ'], selectedSpaceKeys: ['DEV'], selectedRepos: ['org/repo'] },
    status,
    lastSyncedAt: '2026-02-12T00:00:00.000Z',
    createdAt: '2026-02-12T00:00:00.000Z',
    updatedAt: '2026-02-12T00:00:00.000Z',
  } as Integration;
}

function makeCacheEntry(resourceType: string, data: unknown, resourceId = 'r1'): IntegrationCacheEntry {
  return {
    id: `cache-${resourceId}`,
    integrationId: 'int-jira',
    resourceType,
    resourceId,
    data,
    fetchedAt: '2026-02-12T00:00:00.000Z',
  };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    workspaceId: 'ws-1',
    name: 'Alice Smith',
    role: 'Staff Engineer',
    team: 'Platform',
    concerns: 'Technical debt accumulation',
    priorities: 'Improve CI/CD pipeline',
    interviewQuotes: ['We need better testing infrastructure'],
    tags: ['platform', 'devops'],
    notes: 'Key stakeholder for infrastructure decisions',
    sourceFile: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMockIntegrationRepo(integrations: Record<string, Integration | null> = {}): IntegrationRepository {
  return {
    findByWorkspaceAndProvider: vi.fn(async (_wsId: string, provider: string) => {
      return integrations[provider] ?? null;
    }),
  } as unknown as IntegrationRepository;
}

function makeMockCacheRepo(entries: Record<string, IntegrationCacheEntry[]> = {}): IntegrationCacheRepository {
  return {
    findByType: vi.fn(async (_integrationId: string, resourceType: string) => {
      return entries[resourceType] ?? [];
    }),
    findEntry: vi.fn(async (_integrationId: string, resourceType: string, resourceId: string) => {
      const typeEntries = entries[resourceType] ?? [];
      return typeEntries.find((e) => e.resourceId === resourceId) ?? null;
    }),
  } as unknown as IntegrationCacheRepository;
}

function makeMockProfileRepo(profiles: Profile[] = []): ProfileRepository {
  return {
    findByWorkspace: vi.fn().mockResolvedValue(profiles),
  } as unknown as ProfileRepository;
}

// --- Tests ---

describe('ReadExecutor', () => {
  describe('no workspace open', () => {
    it('returns error when no workspace is open', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(),
        makeMockWorkspaceService(null),
      );

      const result = await executor.execute('fetch_jira_data', {});
      expect(result.content).toContain('No workspace is currently open');
    });
  });

  describe('unknown tool', () => {
    it('returns error for unknown tool name', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('fetch_unknown', {});
      expect(result.content).toContain('Unknown read tool: fetch_unknown');
    });
  });

  describe('fetch_jira_data', () => {
    it('returns Jira data from cache', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo({ jira: makeIntegration('jira') }),
        makeMockCacheRepo({
          jira_epic: [
            makeCacheEntry('jira_epic', {
              key: 'PROJ-1',
              fields: { summary: 'Platform Migration', status: { name: 'In Progress' }, issuetype: { name: 'Epic' }, priority: { name: 'High' }, labels: ['platform'], updated: '2026-02-10' },
            }),
          ],
          jira_story: [
            makeCacheEntry('jira_story', {
              key: 'PROJ-5',
              fields: { summary: 'Set up CI', status: { name: 'Done' }, issuetype: { name: 'Story' }, priority: { name: 'Medium' }, labels: [], updated: '2026-02-09', parent: { key: 'PROJ-1' } },
            }),
          ],
          jira_comment: [],
        }),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('fetch_jira_data', {});
      const parsed = JSON.parse(result.content!);

      expect(parsed.source).toBe('jira');
      expect(parsed.epicCount).toBe(1);
      expect(parsed.storyCount).toBe(1);
      expect(parsed.epics[0].key).toBe('PROJ-1');
      expect(parsed.stories[0].key).toBe('PROJ-5');
    });

    it('filters by query when provided', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo({ jira: makeIntegration('jira') }),
        makeMockCacheRepo({
          jira_epic: [
            makeCacheEntry('jira_epic', { key: 'PROJ-1', fields: { summary: 'Platform Migration', status: { name: 'Open' } } }, 'e1'),
            makeCacheEntry('jira_epic', { key: 'PROJ-2', fields: { summary: 'Security Audit', status: { name: 'Open' } } }, 'e2'),
          ],
          jira_story: [],
          jira_comment: [],
        }),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('fetch_jira_data', { query: 'security' });
      const parsed = JSON.parse(result.content!);

      expect(parsed.epicCount).toBe(1);
      expect(parsed.epics[0].key).toBe('PROJ-2');
    });

    it('returns error when Jira not connected', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo({ jira: makeIntegration('jira', 'disconnected') }),
        makeMockCacheRepo(),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('fetch_jira_data', {});
      const parsed = JSON.parse(result.content!);
      expect(parsed.error).toContain('not connected');
    });

    it('returns message when no data in cache', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo({ jira: makeIntegration('jira') }),
        makeMockCacheRepo({ jira_epic: [], jira_story: [], jira_comment: [] }),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('fetch_jira_data', {});
      const parsed = JSON.parse(result.content!);
      expect(parsed.message).toContain('No Jira data');
    });
  });

  describe('fetch_confluence_data', () => {
    it('returns Confluence data from cache', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo({ confluence: makeIntegration('confluence') }),
        makeMockCacheRepo({
          confluence_page: [
            makeCacheEntry('confluence_page', {
              id: 'page-1',
              title: 'Architecture Decision Records',
              body: { storage: { value: '<p>ADR-001: Use event sourcing</p>' } },
              lastUpdated: '2026-02-10',
            }),
          ],
          confluence_comment: [],
        }),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('fetch_confluence_data', {});
      const parsed = JSON.parse(result.content!);

      expect(parsed.source).toBe('confluence');
      expect(parsed.pageCount).toBe(1);
      expect(parsed.pages[0].title).toBe('Architecture Decision Records');
      expect(parsed.pages[0].excerpt).toContain('ADR-001');
    });

    it('returns error when Confluence not connected', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('fetch_confluence_data', {});
      const parsed = JSON.parse(result.content!);
      expect(parsed.error).toContain('not connected');
    });
  });

  describe('fetch_github_data', () => {
    it('returns GitHub data from cache', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo({ github: makeIntegration('github') }),
        makeMockCacheRepo({
          github_pr: [
            makeCacheEntry('github_pr', {
              number: 42,
              title: 'Add error handling',
              state: 'open',
              user: { login: 'dev1' },
              created_at: '2026-02-10',
              merged_at: null,
              additions: 50,
              deletions: 10,
              changed_files: 3,
              labels: [{ name: 'enhancement' }],
            }),
          ],
          github_issue: [
            makeCacheEntry('github_issue', {
              number: 100,
              title: 'Flaky test in CI',
              state: 'open',
              user: { login: 'dev2' },
              created_at: '2026-02-09',
              labels: [{ name: 'bug' }],
            }, 'i1'),
          ],
          github_pr_comment: [],
        }),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('fetch_github_data', {});
      const parsed = JSON.parse(result.content!);

      expect(parsed.source).toBe('github');
      expect(parsed.prCount).toBe(1);
      expect(parsed.issueCount).toBe(1);
      expect(parsed.pullRequests[0].title).toBe('Add error handling');
      expect(parsed.issues[0].title).toBe('Flaky test in CI');
    });

    it('filters by query', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo({ github: makeIntegration('github') }),
        makeMockCacheRepo({
          github_pr: [
            makeCacheEntry('github_pr', { number: 1, title: 'Add error handling', state: 'open', user: null, created_at: '', merged_at: null, additions: 0, deletions: 0, changed_files: 0, labels: [] }, 'pr1'),
            makeCacheEntry('github_pr', { number: 2, title: 'Fix logging', state: 'merged', user: null, created_at: '', merged_at: '', additions: 0, deletions: 0, changed_files: 0, labels: [] }, 'pr2'),
          ],
          github_issue: [],
          github_pr_comment: [],
        }),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('fetch_github_data', { query: 'logging' });
      const parsed = JSON.parse(result.content!);
      expect(parsed.prCount).toBe(1);
      expect(parsed.pullRequests[0].number).toBe(2);
    });

    it('returns error when GitHub not connected', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('fetch_github_data', {});
      const parsed = JSON.parse(result.content!);
      expect(parsed.error).toContain('not connected');
    });
  });

  describe('run_codebase_analysis', () => {
    it('returns codebase analysis from cache', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo({ codebase: makeIntegration('codebase') }),
        makeMockCacheRepo({
          codebase_analysis: [
            makeCacheEntry('codebase_analysis', {
              repo: 'org/repo',
              analyzedAt: '2026-02-10',
              architecture: { summary: 'Layered architecture', modules: ['api', 'core'], concerns: ['coupling'] },
              quality: { summary: 'Good test coverage', strengths: ['Unit tests'], weaknesses: ['No E2E'] },
              technicalDebt: { summary: 'Moderate', items: [{ description: 'Legacy auth', location: 'src/auth', severity: 'high', evidence: 'Hardcoded tokens' }] },
              risks: { summary: 'Low', items: ['Vendor lock-in'] },
              jiraCrossReference: { summary: 'Some correlations', correlations: ['PROJ-1 maps to auth module'] },
            }, 'org/repo'),
          ],
        }),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('run_codebase_analysis', { repos: ['org/repo'] });
      const parsed = JSON.parse(result.content!);

      expect(parsed.source).toBe('codebase');
      expect(parsed.repoCount).toBe(1);
      expect(parsed.repos[0].repo).toBe('org/repo');
      expect(parsed.repos[0].architecture.summary).toBe('Layered architecture');
      expect(parsed.repos[0].technicalDebt.highSeverity).toBe(1);
    });

    it('uses workspace defaults when repos not specified', async () => {
      const integration = makeIntegration('codebase');
      (integration.config as any).selectedRepos = ['org/default-repo'];

      const executor = new ReadExecutor(
        makeMockIntegrationRepo({ codebase: integration }),
        makeMockCacheRepo({
          codebase_analysis: [
            makeCacheEntry('codebase_analysis', {
              repo: 'org/default-repo',
              analyzedAt: '2026-02-10',
              architecture: { summary: 'Monolith', modules: [], concerns: [] },
              quality: { summary: 'Fair', strengths: [], weaknesses: [] },
              technicalDebt: { summary: 'High', items: [] },
              risks: { summary: 'Medium', items: [] },
              jiraCrossReference: null,
            }, 'org/default-repo'),
          ],
        }),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('run_codebase_analysis', {});
      const parsed = JSON.parse(result.content!);
      expect(parsed.repoCount).toBe(1);
      expect(parsed.repos[0].repo).toBe('org/default-repo');
    });

    it('returns error when codebase not configured', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('run_codebase_analysis', {});
      const parsed = JSON.parse(result.content!);
      expect(parsed.error).toContain('not configured');
    });
  });

  describe('search_profiles', () => {
    const profiles = [
      makeProfile({ id: 'p1', name: 'Alice Smith', role: 'Staff Engineer', team: 'Platform', tags: ['platform', 'devops'] }),
      makeProfile({ id: 'p2', name: 'Bob Jones', role: 'Engineering Manager', team: 'Product', tags: ['product', 'management'] }),
      makeProfile({ id: 'p3', name: 'Carol Chen', role: 'Senior Engineer', team: 'Platform', tags: ['platform', 'backend'], concerns: 'Scaling issues with the database' }),
    ];

    it('returns all profiles when no filters', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(profiles),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('search_profiles', {});
      const parsed = JSON.parse(result.content!);

      expect(parsed.source).toBe('profiles');
      expect(parsed.totalProfiles).toBe(3);
      expect(parsed.matchedProfiles).toBe(3);
    });

    it('filters by query matching name', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(profiles),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('search_profiles', { query: 'alice' });
      const parsed = JSON.parse(result.content!);

      expect(parsed.matchedProfiles).toBe(1);
      expect(parsed.profiles[0].name).toBe('Alice Smith');
    });

    it('filters by query matching concerns', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(profiles),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('search_profiles', { query: 'scaling' });
      const parsed = JSON.parse(result.content!);

      expect(parsed.matchedProfiles).toBe(1);
      expect(parsed.profiles[0].name).toBe('Carol Chen');
    });

    it('filters by tags', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(profiles),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('search_profiles', { tags: ['management'] });
      const parsed = JSON.parse(result.content!);

      expect(parsed.matchedProfiles).toBe(1);
      expect(parsed.profiles[0].name).toBe('Bob Jones');
    });

    it('combines query and tag filters', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(profiles),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('search_profiles', { query: 'engineer', tags: ['platform'] });
      const parsed = JSON.parse(result.content!);

      // Alice (Staff Engineer, platform tag) and Carol (Senior Engineer, platform tag) match
      expect(parsed.matchedProfiles).toBe(2);
    });

    it('returns message when no profiles found', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo([]),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('search_profiles', {});
      const parsed = JSON.parse(result.content!);
      expect(parsed.message).toContain('No profiles found');
    });

    it('includes truncated quotes in profile summaries', async () => {
      const profileWithQuotes = makeProfile({
        interviewQuotes: [
          'First quote about testing',
          'Second quote about deployment',
          'Third quote about architecture',
        ],
      });

      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo([profileWithQuotes]),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('search_profiles', {});
      const parsed = JSON.parse(result.content!);

      expect(parsed.profiles[0].quoteCount).toBe(3);
      expect(parsed.profiles[0].quotes).toHaveLength(3);
    });
  });

  describe('list_jira_projects', () => {
    it('returns projects from integration service', async () => {
      const mockIntegrationService = {
        listProjects: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            { id: '1', key: 'PROJ', name: 'Project One', projectTypeKey: 'software' },
            { id: '2', key: 'INFRA', name: 'Infrastructure', projectTypeKey: 'service_desk' },
          ],
        }),
      };

      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
        mockIntegrationService as any,
      );

      const result = await executor.execute('list_jira_projects', {});
      const parsed = JSON.parse(result.content!);

      expect(parsed.source).toBe('jira');
      expect(parsed.projects).toHaveLength(2);
      expect(parsed.projects[0]).toEqual({ key: 'PROJ', name: 'Project One', type: 'software' });
      expect(parsed.projects[1]).toEqual({ key: 'INFRA', name: 'Infrastructure', type: 'service_desk' });
    });

    it('returns error when integration service returns err', async () => {
      const mockIntegrationService = {
        listProjects: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'JIRA_AUTH_FAILED', message: 'Jira authentication failed' },
        }),
      };

      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
        mockIntegrationService as any,
      );

      const result = await executor.execute('list_jira_projects', {});
      const parsed = JSON.parse(result.content!);
      expect(parsed.error).toBe('Jira authentication failed');
    });

    it('returns error when integration service not injected', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('list_jira_projects', {});
      const parsed = JSON.parse(result.content!);
      expect(parsed.error).toBe('Jira is not configured');
    });
  });

  describe('list_confluence_spaces', () => {
    it('returns spaces from confluence service', async () => {
      const mockConfluenceService = {
        listSpaces: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            { id: '1', key: 'DEV', name: 'Development', type: 'global' },
            { id: '2', key: 'ENG', name: 'Engineering', type: 'personal' },
          ],
        }),
      };

      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
        undefined,
        mockConfluenceService as any,
      );

      const result = await executor.execute('list_confluence_spaces', {});
      const parsed = JSON.parse(result.content!);

      expect(parsed.source).toBe('confluence');
      expect(parsed.spaces).toHaveLength(2);
      expect(parsed.spaces[0]).toEqual({ key: 'DEV', name: 'Development', type: 'global' });
      expect(parsed.spaces[1]).toEqual({ key: 'ENG', name: 'Engineering', type: 'personal' });
    });

    it('returns error when confluence service returns err', async () => {
      const mockConfluenceService = {
        listSpaces: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'CONFLUENCE_AUTH_FAILED', message: 'Confluence authentication failed' },
        }),
      };

      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
        undefined,
        mockConfluenceService as any,
      );

      const result = await executor.execute('list_confluence_spaces', {});
      const parsed = JSON.parse(result.content!);
      expect(parsed.error).toBe('Confluence authentication failed');
    });

    it('returns error when confluence service not injected', async () => {
      const executor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo(),
        makeMockWorkspaceService(),
      );

      const result = await executor.execute('list_confluence_spaces', {});
      const parsed = JSON.parse(result.content!);
      expect(parsed.error).toBe('Confluence is not configured');
    });
  });

  describe('ToolExecutorRouter integration', () => {
    it('routes read tools through the router to ReadExecutor', async () => {
      const { ToolExecutorRouter } = await import('./tool-executor-router');
      const { RenderExecutor } = await import('./render-executor');

      const readExecutor = new ReadExecutor(
        makeMockIntegrationRepo(),
        makeMockCacheRepo(),
        makeMockProfileRepo([makeProfile()]),
        makeMockWorkspaceService(),
      );
      const router = new ToolExecutorRouter(new RenderExecutor(), readExecutor);

      const result = await router.execute('search_profiles', 'read', {});
      const parsed = JSON.parse(result.content!);
      expect(parsed.source).toBe('profiles');
    });
  });
});
