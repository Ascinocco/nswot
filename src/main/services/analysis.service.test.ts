import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalysisService } from './analysis.service';
import type { AnalysisRepository } from '../repositories/analysis.repository';
import type { ProfileRepository } from '../repositories/profile.repository';
import type { IntegrationRepository } from '../repositories/integration.repository';
import type { IntegrationCacheRepository } from '../repositories/integration-cache.repository';
import type { SettingsService } from './settings.service';
import type { WorkspaceService } from './workspace.service';
import type { Profile, Analysis, Integration } from '../domain/types';

function makeProfile(id: string, name: string): Profile {
  return {
    id,
    workspaceId: 'ws-1',
    name,
    role: 'Engineer',
    team: 'Platform',
    concerns: 'Scaling',
    priorities: 'Reliability',
    interviewQuotes: ['Need better monitoring'],
    notes: null,
    sourceFile: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function makeAnalysis(): Analysis {
  return {
    id: 'analysis-1',
    workspaceId: 'ws-1',
    role: 'staff_engineer',
    modelId: 'openai/gpt-4',
    status: 'pending',
    config: { profileIds: ['p1'], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [], codebaseRepos: [] },
    inputSnapshot: null,
    swotOutput: null,
    summariesOutput: null,
    qualityMetrics: null,
    rawLlmResponse: null,
    warning: null,
    error: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

describe('AnalysisService', () => {
  let service: AnalysisService;
  let analysisRepo: AnalysisRepository;
  let profileRepo: ProfileRepository;
  let integrationRepo: IntegrationRepository;
  let integrationCacheRepo: IntegrationCacheRepository;
  let settingsService: SettingsService;
  let workspaceService: WorkspaceService;
  let onProgress: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    analysisRepo = {
      insert: vi.fn().mockResolvedValue(makeAnalysis()),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      storeResult: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue({ ...makeAnalysis(), status: 'completed' }),
      insertProfiles: vi.fn().mockResolvedValue(undefined),
    } as unknown as AnalysisRepository;

    profileRepo = {
      findByIds: vi.fn().mockResolvedValue([makeProfile('p1', 'Alice Smith')]),
    } as unknown as ProfileRepository;

    integrationRepo = {
      findByWorkspaceAndProvider: vi.fn().mockResolvedValue(null),
    } as unknown as IntegrationRepository;

    integrationCacheRepo = {
      findByType: vi.fn().mockResolvedValue([]),
    } as unknown as IntegrationCacheRepository;

    settingsService = {
      getApiKey: vi.fn().mockReturnValue('sk-test-key'),
    } as unknown as SettingsService;

    workspaceService = {
      getCurrentId: vi.fn().mockReturnValue('ws-1'),
    } as unknown as WorkspaceService;

    service = new AnalysisService(
      analysisRepo,
      profileRepo,
      integrationRepo,
      integrationCacheRepo,
      settingsService,
      workspaceService,
    );

    onProgress = vi.fn();
  });

  describe('runAnalysis', () => {
    it('returns error when no workspace is open', async () => {
      vi.mocked(workspaceService.getCurrentId).mockReturnValue(null);

      const result = await service.runAnalysis(
        {
          profileIds: ['p1'],
          jiraProjectKeys: [],
          confluenceSpaceKeys: [],
          githubRepos: [],
          codebaseRepos: [],
          role: 'staff_engineer',
          modelId: 'openai/gpt-4',
          contextWindow: 128000,
        },
        onProgress,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WORKSPACE_NOT_FOUND');
      }
    });

    it('returns error when API key is not set', async () => {
      vi.mocked(settingsService.getApiKey).mockReturnValue(null);

      const result = await service.runAnalysis(
        {
          profileIds: ['p1'],
          jiraProjectKeys: [],
          confluenceSpaceKeys: [],
          githubRepos: [],
          codebaseRepos: [],
          role: 'staff_engineer',
          modelId: 'openai/gpt-4',
          contextWindow: 128000,
        },
        onProgress,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('LLM_AUTH_FAILED');
      }
    });

    it('returns error when no profiles selected', async () => {
      const result = await service.runAnalysis(
        {
          profileIds: [],
          jiraProjectKeys: [],
          confluenceSpaceKeys: [],
          githubRepos: [],
          codebaseRepos: [],
          role: 'staff_engineer',
          modelId: 'openai/gpt-4',
          contextWindow: 128000,
        },
        onProgress,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ANALYSIS_NO_PROFILES');
      }
    });

    it('creates analysis record and starts pipeline', async () => {
      // This will fail at the LLM call (no real API), but we can verify the early stages
      const result = await service.runAnalysis(
        {
          profileIds: ['p1'],
          jiraProjectKeys: [],
          confluenceSpaceKeys: [],
          githubRepos: [],
          codebaseRepos: [],
          role: 'staff_engineer',
          modelId: 'openai/gpt-4',
          contextWindow: 128000,
        },
        onProgress,
      );

      // Should create analysis and update status
      expect(analysisRepo.insert).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        role: 'staff_engineer',
        modelId: 'openai/gpt-4',
        config: { profileIds: ['p1'], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [], codebaseRepos: [] },
      });
      expect(analysisRepo.updateStatus).toHaveBeenCalledWith(
        'analysis-1',
        'running',
        expect.objectContaining({ startedAt: expect.any(String) }),
      );

      // Should have sent progress events for early stages
      const stages = onProgress.mock.calls.map((call) => call[0].stage);
      expect(stages).toContain('collecting');
      expect(stages).toContain('anonymizing');
      expect(stages).toContain('building_prompt');
      expect(stages).toContain('sending');

      // The result will be an error since we can't actually call OpenRouter
      // But the pipeline stages ran correctly
      expect(result.ok).toBe(false);
    });

    it('loads profiles from repository', async () => {
      await service.runAnalysis(
        {
          profileIds: ['p1'],
          jiraProjectKeys: [],
          confluenceSpaceKeys: [],
          githubRepos: [],
          codebaseRepos: [],
          role: 'staff_engineer',
          modelId: 'openai/gpt-4',
          contextWindow: 128000,
        },
        onProgress,
      );

      expect(profileRepo.findByIds).toHaveBeenCalledWith(['p1']);
    });

    it('stores input snapshot with anonymized data', async () => {
      await service.runAnalysis(
        {
          profileIds: ['p1'],
          jiraProjectKeys: [],
          confluenceSpaceKeys: [],
          githubRepos: [],
          codebaseRepos: [],
          role: 'staff_engineer',
          modelId: 'openai/gpt-4',
          contextWindow: 128000,
        },
        onProgress,
      );

      // Second updateStatus call should include inputSnapshot
      const calls = vi.mocked(analysisRepo.updateStatus).mock.calls;
      const snapshotCall = calls.find(
        (c) => c[2] && 'inputSnapshot' in (c[2] as Record<string, unknown>),
      );
      expect(snapshotCall).toBeDefined();
      const snapshot = (snapshotCall![2] as { inputSnapshot: unknown }).inputSnapshot as {
        profiles: Array<{ label: string }>;
        pseudonymMap: Record<string, string>;
      };
      expect(snapshot.profiles[0]!.label).toBe('Stakeholder A');
      expect(snapshot.pseudonymMap['Stakeholder A']).toBe('Alice Smith');
    });

    it('inserts analysis-profile junction records', async () => {
      await service.runAnalysis(
        {
          profileIds: ['p1'],
          jiraProjectKeys: [],
          confluenceSpaceKeys: [],
          githubRepos: [],
          codebaseRepos: [],
          role: 'staff_engineer',
          modelId: 'openai/gpt-4',
          contextWindow: 128000,
        },
        onProgress,
      );

      expect(analysisRepo.insertProfiles).toHaveBeenCalledWith('analysis-1', [
        {
          analysisId: 'analysis-1',
          profileId: 'p1',
          anonymizedLabel: 'Stakeholder A',
        },
      ]);
    });

    it('marks analysis as failed on error', async () => {
      await service.runAnalysis(
        {
          profileIds: ['p1'],
          jiraProjectKeys: [],
          confluenceSpaceKeys: [],
          githubRepos: [],
          codebaseRepos: [],
          role: 'staff_engineer',
          modelId: 'openai/gpt-4',
          contextWindow: 128000,
        },
        onProgress,
      );

      // The LLM call will fail (no real API), so it should mark as failed
      const failedCalls = vi.mocked(analysisRepo.updateStatus).mock.calls.filter(
        (c) => c[1] === 'failed',
      );
      expect(failedCalls).toHaveLength(1);
    });
  });

  describe('getPayloadPreview', () => {
    it('returns error when no workspace is open', async () => {
      vi.mocked(workspaceService.getCurrentId).mockReturnValue(null);

      const result = await service.getPayloadPreview(['p1'], [], [], [], [], 'staff_engineer', 128000);
      expect(result.ok).toBe(false);
    });

    it('builds preview with anonymized profiles', async () => {
      const result = await service.getPayloadPreview(['p1'], [], [], [], [], 'staff_engineer', 128000);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.systemPrompt).toContain('NEVER invent information');
        expect(result.value.userPrompt).toContain('Stakeholder A');
        expect(result.value.userPrompt).not.toContain('Alice Smith');
        expect(result.value.tokenEstimate).toBeGreaterThan(0);
      }
    });

    it('includes Jira data in preview when available', async () => {
      const integration: Integration = {
        id: 'int-1',
        workspaceId: 'ws-1',
        provider: 'jira',
        config: { cloudId: 'cloud-1', siteUrl: 'https://test.atlassian.net', selectedProjectKeys: ['PROJ'] },
        status: 'connected',
        lastSyncedAt: new Date().toISOString(),
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      vi.mocked(integrationRepo.findByWorkspaceAndProvider).mockResolvedValue(integration);
      vi.mocked(integrationCacheRepo.findByType).mockResolvedValue([
        {
          id: 'cache-1',
          integrationId: 'int-1',
          resourceType: 'jira_epic',
          resourceId: 'PROJ-1',
          data: {
            key: 'PROJ-1',
            fields: {
              summary: 'Migration epic',
              description: null,
              status: { name: 'In Progress' },
              updated: '2024-06-01',
            },
          },
          fetchedAt: new Date().toISOString(),
        },
      ]);

      const result = await service.getPayloadPreview(['p1'], ['PROJ'], [], [], [], 'staff_engineer', 128000);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.userPrompt).toContain('PROJ-1');
        expect(result.value.userPrompt).toContain('Migration epic');
      }
    });
  });
});
