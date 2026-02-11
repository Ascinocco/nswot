import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService, buildChatSystemPrompt } from './chat.service';
import type { ChatRepository } from '../repositories/chat.repository';
import type { AnalysisRepository } from '../repositories/analysis.repository';
import type { SettingsService } from './settings.service';
import type { Analysis, ChatMessage } from '../domain/types';

function makeCompletedAnalysis(overrides?: Partial<Analysis>): Analysis {
  return {
    id: 'analysis-1',
    workspaceId: 'ws-1',
    role: 'staff_engineer',
    modelId: 'openai/gpt-4',
    status: 'completed',
    config: { profileIds: ['p1'], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [] },
    inputSnapshot: null,
    swotOutput: {
      strengths: [
        {
          claim: 'Strong team',
          evidence: [
            {
              sourceType: 'profile',
              sourceId: 'profile:Stakeholder A',
              sourceLabel: 'Stakeholder A',
              quote: 'Great team culture',
            },
          ],
          impact: 'High morale',
          recommendation: 'Keep it up',
          confidence: 'high',
        },
      ],
      weaknesses: [],
      opportunities: [],
      threats: [],
    },
    summariesOutput: {
      profiles: 'Team culture is strong.',
      jira: 'No Jira data.',
      confluence: null,
      github: null,
    },
    rawLlmResponse: '{}',
    warning: null,
    error: null,
    startedAt: '2024-01-01T00:00:00.000Z',
    completedAt: '2024-01-01T00:01:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ChatService', () => {
  let chatRepo: ChatRepository;
  let analysisRepo: AnalysisRepository;
  let settingsService: SettingsService;
  let service: ChatService;

  beforeEach(() => {
    chatRepo = {
      findByAnalysis: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockImplementation(async (analysisId, role, content) => ({
        id: 'msg-1',
        analysisId,
        role,
        content,
        createdAt: '2024-01-01T00:00:00.000Z',
      })),
      deleteByAnalysis: vi.fn().mockResolvedValue(undefined),
      countByAnalysis: vi.fn().mockResolvedValue(0),
    } as unknown as ChatRepository;

    analysisRepo = {
      findById: vi.fn().mockResolvedValue(makeCompletedAnalysis()),
    } as unknown as AnalysisRepository;

    settingsService = {
      getApiKey: vi.fn().mockReturnValue('sk-test-key'),
    } as unknown as SettingsService;

    service = new ChatService(chatRepo, analysisRepo, settingsService);
  });

  describe('getMessages', () => {
    it('returns messages for a valid analysis', async () => {
      const mockMessages: ChatMessage[] = [
        {
          id: 'msg-1',
          analysisId: 'analysis-1',
          role: 'user',
          content: 'Hello',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ];
      vi.mocked(chatRepo.findByAnalysis).mockResolvedValue(mockMessages);

      const result = await service.getMessages('analysis-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.content).toBe('Hello');
      }
    });

    it('returns error when analysis not found', async () => {
      vi.mocked(analysisRepo.findById).mockResolvedValue(null);

      const result = await service.getMessages('nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('sendMessage', () => {
    it('returns error when analysis not found', async () => {
      vi.mocked(analysisRepo.findById).mockResolvedValue(null);

      const result = await service.sendMessage('nonexistent', 'Hello', vi.fn());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('returns error when analysis is not completed', async () => {
      vi.mocked(analysisRepo.findById).mockResolvedValue(
        makeCompletedAnalysis({ status: 'running' }),
      );

      const result = await service.sendMessage('analysis-1', 'Hello', vi.fn());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
        expect(result.error.message).toContain('incomplete');
      }
    });

    it('returns error when API key is not configured', async () => {
      vi.mocked(settingsService.getApiKey).mockReturnValue(null);

      const result = await service.sendMessage('analysis-1', 'Hello', vi.fn());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('LLM_AUTH_FAILED');
      }
    });
  });

  describe('deleteMessages', () => {
    it('deletes messages for a valid analysis', async () => {
      const result = await service.deleteMessages('analysis-1');
      expect(result.ok).toBe(true);
      expect(chatRepo.deleteByAnalysis).toHaveBeenCalledWith('analysis-1');
    });

    it('returns error when analysis not found', async () => {
      vi.mocked(analysisRepo.findById).mockResolvedValue(null);

      const result = await service.deleteMessages('nonexistent');
      expect(result.ok).toBe(false);
    });
  });
});

describe('buildChatSystemPrompt', () => {
  it('includes role context for staff engineer', () => {
    const analysis = makeCompletedAnalysis({ role: 'staff_engineer' });
    const prompt = buildChatSystemPrompt(analysis);
    expect(prompt).toContain('Staff Engineer');
    expect(prompt).toContain('follow-up analyst');
  });

  it('includes role context for senior EM', () => {
    const analysis = makeCompletedAnalysis({ role: 'senior_em' });
    const prompt = buildChatSystemPrompt(analysis);
    expect(prompt).toContain('Senior Engineering Manager');
  });

  it('includes SWOT data', () => {
    const analysis = makeCompletedAnalysis();
    const prompt = buildChatSystemPrompt(analysis);
    expect(prompt).toContain('Strong team');
    expect(prompt).toContain('Great team culture');
    expect(prompt).toContain('profile:Stakeholder A');
  });

  it('includes summaries', () => {
    const analysis = makeCompletedAnalysis();
    const prompt = buildChatSystemPrompt(analysis);
    expect(prompt).toContain('Team culture is strong.');
    expect(prompt).toContain('No Jira data.');
  });

  it('includes grounding rules', () => {
    const analysis = makeCompletedAnalysis();
    const prompt = buildChatSystemPrompt(analysis);
    expect(prompt).toContain('Do not invent information');
    expect(prompt).toContain('cannot create files');
  });

  it('handles analysis with no SWOT output', () => {
    const analysis = makeCompletedAnalysis({ swotOutput: null, summariesOutput: null });
    const prompt = buildChatSystemPrompt(analysis);
    expect(prompt).toContain('follow-up analyst');
    expect(prompt).not.toContain('Strong team');
  });
});
