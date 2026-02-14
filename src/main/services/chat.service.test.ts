import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService, buildChatSystemPrompt, getConnectedIntegrations } from './chat.service';
import type { ChatRepository } from '../repositories/chat.repository';
import type { ChatActionRepository } from '../repositories/chat-action.repository';
import type { AnalysisRepository } from '../repositories/analysis.repository';
import type { SettingsService } from './settings.service';
import type { ActionExecutor } from '../providers/actions/action-executor';
import { ActionExecutor as ActionExecutorImpl } from '../providers/actions/action-executor';
import type { FileService } from './file.service';
import { ok, err } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { Analysis, ChatMessage, ChatAction } from '../domain/types';

function makeCompletedAnalysis(overrides?: Partial<Analysis>): Analysis {
  return {
    id: 'analysis-1',
    workspaceId: 'ws-1',
    role: 'staff_engineer',
    modelId: 'openai/gpt-4',
    status: 'completed',
    config: { profileIds: ['p1'], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [], codebaseRepos: [] },
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
      codebase: null,
    },
    qualityMetrics: null,
    rawLlmResponse: '{}',
    warning: null,
    error: null,
    startedAt: '2024-01-01T00:00:00.000Z',
    completedAt: '2024-01-01T00:01:00.000Z',
    conversationId: null,
    parentAnalysisId: null,
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
      getActiveApiKey: vi.fn().mockReturnValue('sk-test-key'),
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
          contentFormat: 'text',
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
      vi.mocked(settingsService.getActiveApiKey).mockReturnValue(null);

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

  it('includes role context for VP of Engineering', () => {
    const analysis = makeCompletedAnalysis({ role: 'vp_engineering' as Analysis['role'] });
    const prompt = buildChatSystemPrompt(analysis);
    expect(prompt).toContain('VP of Engineering');
    expect(prompt).not.toContain('Senior Engineering Manager');
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
    // When no workspace and no integrations, the "cannot create files" rule is included
    expect(prompt).toContain('cannot create files');
  });

  it('handles analysis with no SWOT output', () => {
    const analysis = makeCompletedAnalysis({ swotOutput: null, summariesOutput: null });
    const prompt = buildChatSystemPrompt(analysis);
    expect(prompt).toContain('follow-up analyst');
    expect(prompt).not.toContain('Strong team');
  });

  it('includes ACTIONS section when connectedIntegrations provided', () => {
    const analysis = makeCompletedAnalysis({
      config: { profileIds: ['p1'], jiraProjectKeys: ['PROJ', 'TEAM'], confluenceSpaceKeys: [], githubRepos: [], codebaseRepos: [] },
    });
    const prompt = buildChatSystemPrompt(analysis, ['jira']);
    expect(prompt).toContain('ACTIONS:');
    expect(prompt).toContain('tools available to create artifacts');
    expect(prompt).toContain('Available Jira projects: PROJ, TEAM');
  });

  it('excludes ACTIONS section when no integrations connected', () => {
    const analysis = makeCompletedAnalysis();
    const prompt = buildChatSystemPrompt(analysis);
    expect(prompt).not.toContain('ACTIONS:');
  });

  it('includes Confluence spaces in ACTIONS section', () => {
    const analysis = makeCompletedAnalysis({
      config: { profileIds: ['p1'], jiraProjectKeys: [], confluenceSpaceKeys: ['ENG', 'DOCS'], githubRepos: [], codebaseRepos: [] },
    });
    const prompt = buildChatSystemPrompt(analysis, ['confluence']);
    expect(prompt).toContain('ACTIONS:');
    expect(prompt).toContain('Available Confluence spaces: ENG, DOCS');
  });

  it('includes GitHub repos in ACTIONS section', () => {
    const analysis = makeCompletedAnalysis({
      config: { profileIds: ['p1'], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: ['org/repo1', 'org/repo2'], codebaseRepos: [] },
    });
    const prompt = buildChatSystemPrompt(analysis, ['github']);
    expect(prompt).toContain('ACTIONS:');
    expect(prompt).toContain('Available GitHub repos: org/repo1, org/repo2');
  });

  it('includes all integrations when multiple connected', () => {
    const analysis = makeCompletedAnalysis({
      config: { profileIds: ['p1'], jiraProjectKeys: ['PROJ'], confluenceSpaceKeys: ['ENG'], githubRepos: ['org/repo'], codebaseRepos: [] },
    });
    const prompt = buildChatSystemPrompt(analysis, ['jira', 'confluence', 'github']);
    expect(prompt).toContain('Available Jira projects: PROJ');
    expect(prompt).toContain('Available Confluence spaces: ENG');
    expect(prompt).toContain('Available GitHub repos: org/repo');
  });

  it('includes FILE GENERATION section when workspace is open', () => {
    const analysis = makeCompletedAnalysis();
    const prompt = buildChatSystemPrompt(analysis, undefined, true);
    expect(prompt).toContain('FILE GENERATION:');
    expect(prompt).toContain('write_markdown_file');
    expect(prompt).toContain('write_csv_file');
    expect(prompt).toContain('write_mermaid_file');
    expect(prompt).toContain('user must approve');
  });

  it('excludes FILE GENERATION section when no workspace', () => {
    const analysis = makeCompletedAnalysis();
    const prompt = buildChatSystemPrompt(analysis, undefined, false);
    expect(prompt).not.toContain('FILE GENERATION:');
  });

  it('omits "cannot create files" rule when workspace is open', () => {
    const analysis = makeCompletedAnalysis();
    const prompt = buildChatSystemPrompt(analysis, undefined, true);
    expect(prompt).not.toContain('cannot create files');
  });

  it('includes EDITOR CONTEXT section when editor context has filePath', () => {
    const analysis = makeCompletedAnalysis();
    const editorContext = { filePath: 'src/app.ts', contentPreview: 'import React...', selectedText: null };
    const prompt = buildChatSystemPrompt(analysis, undefined, true, editorContext);
    expect(prompt).toContain('EDITOR CONTEXT:');
    expect(prompt).toContain('File: src/app.ts');
    expect(prompt).toContain('Content preview:');
    expect(prompt).toContain('import React...');
  });

  it('includes selected text in editor context', () => {
    const analysis = makeCompletedAnalysis();
    const editorContext = { filePath: 'src/app.ts', contentPreview: null, selectedText: 'const x = 42;' };
    const prompt = buildChatSystemPrompt(analysis, undefined, true, editorContext);
    expect(prompt).toContain('EDITOR CONTEXT:');
    expect(prompt).toContain('Selected text:');
    expect(prompt).toContain('const x = 42;');
  });

  it('excludes EDITOR CONTEXT when no file is open', () => {
    const analysis = makeCompletedAnalysis();
    const editorContext = { filePath: null, contentPreview: null, selectedText: null };
    const prompt = buildChatSystemPrompt(analysis, undefined, true, editorContext);
    expect(prompt).not.toContain('EDITOR CONTEXT:');
  });

  it('excludes EDITOR CONTEXT when editor context is null', () => {
    const analysis = makeCompletedAnalysis();
    const prompt = buildChatSystemPrompt(analysis, undefined, true, null);
    expect(prompt).not.toContain('EDITOR CONTEXT:');
  });
});

describe('getConnectedIntegrations', () => {
  it('returns jira when jiraProjectKeys is non-empty', () => {
    const analysis = makeCompletedAnalysis({
      config: { profileIds: ['p1'], jiraProjectKeys: ['PROJ'], confluenceSpaceKeys: [], githubRepos: [], codebaseRepos: [] },
    });
    expect(getConnectedIntegrations(analysis)).toEqual(['jira']);
  });

  it('returns empty array when no integrations configured', () => {
    const analysis = makeCompletedAnalysis();
    expect(getConnectedIntegrations(analysis)).toEqual([]);
  });

  it('returns all connected integrations', () => {
    const analysis = makeCompletedAnalysis({
      config: { profileIds: ['p1'], jiraProjectKeys: ['PROJ'], confluenceSpaceKeys: ['ENG'], githubRepos: ['org/repo'], codebaseRepos: [] },
    });
    expect(getConnectedIntegrations(analysis)).toEqual(['jira', 'confluence', 'github']);
  });
});

describe('ChatService editor context', () => {
  let chatRepo: ChatRepository;
  let analysisRepo: AnalysisRepository;
  let settingsService: SettingsService;
  let service: ChatService;

  beforeEach(() => {
    chatRepo = {
      findByAnalysis: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockImplementation(async (analysisId: string, role: string, content: string) => ({
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
      getActiveApiKey: vi.fn().mockReturnValue('sk-test-key'),
    } as unknown as SettingsService;

    service = new ChatService(chatRepo, analysisRepo, settingsService);
  });

  it('stores and retrieves editor context', () => {
    const ctx = { filePath: 'src/index.ts', contentPreview: 'code', selectedText: null };
    service.setEditorContext(ctx);
    expect(service.getEditorContext()).toEqual(ctx);
  });

  it('clears editor context when set to null', () => {
    service.setEditorContext({ filePath: 'test.ts', contentPreview: null, selectedText: null });
    service.setEditorContext(null);
    expect(service.getEditorContext()).toBeNull();
  });

  it('tracks workspace open state', () => {
    service.setWorkspaceOpen(true);
    // We can't directly assert the private field, but we verify it doesn't throw
    service.setWorkspaceOpen(false);
  });
});

describe('ChatService actions', () => {
  let chatRepo: ChatRepository;
  let chatActionRepo: ChatActionRepository;
  let analysisRepo: AnalysisRepository;
  let settingsService: SettingsService;
  let actionExecutor: ActionExecutor;
  let service: ChatService;

  const pendingAction: ChatAction = {
    id: 'action-1',
    analysisId: 'analysis-1',
    chatMessageId: 'msg-1',
    toolName: 'create_jira_issue',
    toolInput: {
      _toolCallId: 'call_123',
      project: 'PROJ',
      issueType: 'Epic',
      summary: 'Test epic',
      description: 'Test desc',
    },
    status: 'pending',
    result: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    executedAt: null,
  };

  beforeEach(() => {
    chatRepo = {
      findByAnalysis: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockImplementation(async (analysisId, role, content) => ({
        id: 'msg-2',
        analysisId,
        role,
        content,
        createdAt: '2024-01-01T00:00:00.000Z',
      })),
      deleteByAnalysis: vi.fn().mockResolvedValue(undefined),
      countByAnalysis: vi.fn().mockResolvedValue(0),
    } as unknown as ChatRepository;

    chatActionRepo = {
      insert: vi.fn().mockImplementation(async (analysisId, toolName, toolInput, chatMessageId) => ({
        id: 'action-new',
        analysisId,
        chatMessageId,
        toolName,
        toolInput,
        status: 'pending',
        result: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        executedAt: null,
      })),
      findById: vi.fn().mockResolvedValue(pendingAction),
      findByAnalysis: vi.fn().mockResolvedValue([pendingAction]),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateToolInput: vi.fn().mockResolvedValue(undefined),
      deleteByAnalysis: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatActionRepository;

    analysisRepo = {
      findById: vi.fn().mockResolvedValue(makeCompletedAnalysis()),
    } as unknown as AnalysisRepository;

    settingsService = {
      getApiKey: vi.fn().mockReturnValue('sk-test-key'),
      getActiveApiKey: vi.fn().mockReturnValue('sk-test-key'),
    } as unknown as SettingsService;

    actionExecutor = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        id: 'PROJ-123',
        url: 'https://jira.example.com/PROJ-123',
      }),
    } as unknown as ActionExecutor;

    service = new ChatService(chatRepo, analysisRepo, settingsService, chatActionRepo, actionExecutor);
  });

  describe('listActions', () => {
    it('returns actions for analysis', async () => {
      const result = await service.listActions('analysis-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.toolName).toBe('create_jira_issue');
      }
    });

    it('returns empty array when no action repo', async () => {
      const serviceNoActions = new ChatService(chatRepo, analysisRepo, settingsService);
      const result = await serviceNoActions.listActions('analysis-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('editAction', () => {
    it('updates tool input for a pending action', async () => {
      const editedInput = { project: 'PROJ', issueType: 'Epic', summary: 'Edited', description: 'New desc' };
      const result = await service.editAction('action-1', editedInput);
      expect(result.ok).toBe(true);
      expect(chatActionRepo.updateToolInput).toHaveBeenCalledWith('action-1', editedInput);
    });

    it('returns error when action not found', async () => {
      vi.mocked(chatActionRepo.findById).mockResolvedValueOnce(null);
      const result = await service.editAction('non-existent', { summary: 'x' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ACTION_NOT_FOUND');
      }
    });

    it('returns error when action is not pending', async () => {
      vi.mocked(chatActionRepo.findById).mockResolvedValueOnce({
        ...pendingAction,
        status: 'completed',
      });
      const result = await service.editAction('action-1', { summary: 'x' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ACTION_INVALID_STATUS');
      }
    });

    it('returns error when no action repo', async () => {
      const serviceNoActions = new ChatService(chatRepo, analysisRepo, settingsService);
      const result = await serviceNoActions.editAction('action-1', { summary: 'x' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('approveAction', () => {
    it('executes action and updates status', async () => {
      // Keep a sibling pending so continuation is not triggered (avoids fetch)
      vi.mocked(chatActionRepo.findByAnalysis).mockResolvedValue([
        { ...pendingAction, status: 'completed' },
        { ...pendingAction, id: 'action-2', status: 'pending' },
      ]);

      const result = await service.approveAction('action-1', vi.fn());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.id).toBe('PROJ-123');
      }

      // Should update status to approved, then executing
      expect(chatActionRepo.updateStatus).toHaveBeenCalledWith('action-1', 'approved');
      expect(chatActionRepo.updateStatus).toHaveBeenCalledWith('action-1', 'executing');
      // Should execute with clean input (no _toolCallId)
      expect(actionExecutor.execute).toHaveBeenCalledWith('create_jira_issue', {
        project: 'PROJ',
        issueType: 'Epic',
        summary: 'Test epic',
        description: 'Test desc',
      });
      // Should update final status
      expect(chatActionRepo.updateStatus).toHaveBeenCalledWith('action-1', 'completed', {
        success: true,
        id: 'PROJ-123',
        url: 'https://jira.example.com/PROJ-123',
      });
    });

    it('returns error when action not found', async () => {
      vi.mocked(chatActionRepo.findById).mockResolvedValue(null);

      const result = await service.approveAction('nonexistent', vi.fn());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ACTION_NOT_FOUND');
      }
    });

    it('returns error when action is not pending', async () => {
      vi.mocked(chatActionRepo.findById).mockResolvedValue({
        ...pendingAction,
        status: 'completed',
      });

      const result = await service.approveAction('action-1', vi.fn());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ACTION_INVALID_STATUS');
      }
    });

    it('returns error when no action support configured', async () => {
      const serviceNoActions = new ChatService(chatRepo, analysisRepo, settingsService);
      const result = await serviceNoActions.approveAction('action-1', vi.fn());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('handles action executor failure', async () => {
      vi.mocked(actionExecutor.execute).mockRejectedValue(new Error('CLI not found'));
      // Keep a sibling pending so continuation is not triggered
      vi.mocked(chatActionRepo.findByAnalysis).mockResolvedValue([
        { ...pendingAction, status: 'failed' },
        { ...pendingAction, id: 'action-2', status: 'pending' },
      ]);

      const result = await service.approveAction('action-1', vi.fn());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(false);
        expect(result.value.error).toBe('CLI not found');
      }
      expect(chatActionRepo.updateStatus).toHaveBeenCalledWith('action-1', 'failed', {
        success: false,
        error: 'CLI not found',
      });
    });
  });

  describe('rejectAction', () => {
    it('rejects action and updates status', async () => {
      // Keep a sibling pending so continuation is not triggered (avoids fetch)
      vi.mocked(chatActionRepo.findByAnalysis).mockResolvedValue([
        { ...pendingAction, status: 'rejected' },
        { ...pendingAction, id: 'action-2', status: 'pending' },
      ]);

      const result = await service.rejectAction('action-1', vi.fn());
      expect(result.ok).toBe(true);
      expect(chatActionRepo.updateStatus).toHaveBeenCalledWith('action-1', 'rejected');
    });

    it('returns error when action not found', async () => {
      vi.mocked(chatActionRepo.findById).mockResolvedValue(null);

      const result = await service.rejectAction('nonexistent', vi.fn());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ACTION_NOT_FOUND');
      }
    });

    it('returns error when action is not pending', async () => {
      vi.mocked(chatActionRepo.findById).mockResolvedValue({
        ...pendingAction,
        status: 'approved',
      });

      const result = await service.rejectAction('action-1', vi.fn());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ACTION_INVALID_STATUS');
      }
    });
  });
});

describe('ChatService file-write integration', () => {
  let chatRepo: ChatRepository;
  let chatActionRepo: ChatActionRepository;
  let analysisRepo: AnalysisRepository;
  let settingsService: SettingsService;
  let fileService: FileService;
  let service: ChatService;

  function makeFileWriteAction(
    toolName: 'write_markdown_file' | 'write_csv_file' | 'write_mermaid_file',
    path: string,
    content: string,
  ): ChatAction {
    return {
      id: 'file-action-1',
      analysisId: 'analysis-1',
      chatMessageId: 'msg-1',
      toolName,
      toolInput: { _toolCallId: 'call_file_1', path, content },
      status: 'pending',
      result: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      executedAt: null,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    chatRepo = {
      findByAnalysis: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockImplementation(async (analysisId: string, role: string, content: string) => ({
        id: 'msg-1', analysisId, role, content, createdAt: '2024-01-01T00:00:00.000Z',
      })),
      deleteByAnalysis: vi.fn().mockResolvedValue(undefined),
      countByAnalysis: vi.fn().mockResolvedValue(0),
    } as unknown as ChatRepository;

    analysisRepo = {
      findById: vi.fn().mockResolvedValue(makeCompletedAnalysis()),
    } as unknown as AnalysisRepository;

    settingsService = {
      getApiKey: vi.fn().mockReturnValue('sk-test-key'),
      getActiveApiKey: vi.fn().mockReturnValue('sk-test-key'),
    } as unknown as SettingsService;

    fileService = {
      writeFile: vi.fn().mockResolvedValue(ok(undefined)),
      readFile: vi.fn().mockResolvedValue(ok('')),
      listDirectory: vi.fn().mockResolvedValue(ok([])),
    } as unknown as FileService;
  });

  it('approves markdown file-write and writes via FileService', async () => {
    const action = makeFileWriteAction('write_markdown_file', 'reports/summary.md', '# Summary\n\nKey findings.');

    chatActionRepo = {
      findById: vi.fn().mockResolvedValue(action),
      findByAnalysis: vi.fn().mockResolvedValue([
        { ...action, status: 'completed' },
        { ...action, id: 'file-action-2', status: 'pending' },
      ]),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateToolInput: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn(),
      deleteByAnalysis: vi.fn(),
    } as unknown as ChatActionRepository;

    const realExecutor = new ActionExecutorImpl(undefined, fileService);
    service = new ChatService(chatRepo, analysisRepo, settingsService, chatActionRepo, realExecutor);

    const result = await service.approveAction('file-action-1', vi.fn());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      expect(result.value.id).toBe('reports/summary.md');
    }

    expect(fileService.writeFile).toHaveBeenCalledWith('reports/summary.md', '# Summary\n\nKey findings.');
    expect(chatActionRepo.updateStatus).toHaveBeenCalledWith('file-action-1', 'completed', {
      success: true,
      id: 'reports/summary.md',
    });
  });

  it('approves mermaid file-write and writes .mmd content', async () => {
    const mermaidContent = 'graph TD\n  A[Start] --> B[End]';
    const action = makeFileWriteAction('write_mermaid_file', 'diagrams/arch.mmd', mermaidContent);

    chatActionRepo = {
      findById: vi.fn().mockResolvedValue(action),
      findByAnalysis: vi.fn().mockResolvedValue([
        { ...action, status: 'completed' },
        { ...action, id: 'file-action-2', status: 'pending' },
      ]),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateToolInput: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn(),
      deleteByAnalysis: vi.fn(),
    } as unknown as ChatActionRepository;

    const realExecutor = new ActionExecutorImpl(undefined, fileService);
    service = new ChatService(chatRepo, analysisRepo, settingsService, chatActionRepo, realExecutor);

    const result = await service.approveAction('file-action-1', vi.fn());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      expect(result.value.id).toBe('diagrams/arch.mmd');
    }

    expect(fileService.writeFile).toHaveBeenCalledWith('diagrams/arch.mmd', mermaidContent);
  });

  it('approves CSV file-write and writes .csv content', async () => {
    const csvContent = 'name,score,team\nAlice,95,Platform\nBob,88,Quality';
    const action = makeFileWriteAction('write_csv_file', 'exports/metrics.csv', csvContent);

    chatActionRepo = {
      findById: vi.fn().mockResolvedValue(action),
      findByAnalysis: vi.fn().mockResolvedValue([
        { ...action, status: 'completed' },
        { ...action, id: 'file-action-2', status: 'pending' },
      ]),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateToolInput: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn(),
      deleteByAnalysis: vi.fn(),
    } as unknown as ChatActionRepository;

    const realExecutor = new ActionExecutorImpl(undefined, fileService);
    service = new ChatService(chatRepo, analysisRepo, settingsService, chatActionRepo, realExecutor);

    const result = await service.approveAction('file-action-1', vi.fn());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      expect(result.value.id).toBe('exports/metrics.csv');
    }

    expect(fileService.writeFile).toHaveBeenCalledWith('exports/metrics.csv', csvContent);
  });

  it('rejects path traversal attempts before reaching FileService', async () => {
    const action = makeFileWriteAction('write_markdown_file', '../../../etc/passwd', 'malicious');

    chatActionRepo = {
      findById: vi.fn().mockResolvedValue(action),
      findByAnalysis: vi.fn().mockResolvedValue([
        { ...action, status: 'failed' },
        { ...action, id: 'file-action-2', status: 'pending' },
      ]),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateToolInput: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn(),
      deleteByAnalysis: vi.fn(),
    } as unknown as ChatActionRepository;

    const realExecutor = new ActionExecutorImpl(undefined, fileService);
    service = new ChatService(chatRepo, analysisRepo, settingsService, chatActionRepo, realExecutor);

    const result = await service.approveAction('file-action-1', vi.fn());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(false);
      expect(result.value.error).toContain('Path traversal not allowed');
    }

    expect(chatActionRepo.updateStatus).toHaveBeenCalledWith('file-action-1', 'failed', {
      success: false,
      error: 'Path traversal not allowed: must be a relative path within the workspace',
    });
  });

  it('propagates FileService error when file-write fails', async () => {
    const action = makeFileWriteAction('write_markdown_file', 'valid/path.md', 'content');

    chatActionRepo = {
      findById: vi.fn().mockResolvedValue(action),
      findByAnalysis: vi.fn().mockResolvedValue([
        { ...action, status: 'failed' },
        { ...action, id: 'file-action-2', status: 'pending' },
      ]),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateToolInput: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn(),
      deleteByAnalysis: vi.fn(),
    } as unknown as ChatActionRepository;

    vi.mocked(fileService.writeFile).mockResolvedValue(
      err(new DomainError(ERROR_CODES.WORKSPACE_PATH_INVALID, 'Path resolves outside workspace root')),
    );

    const realExecutor = new ActionExecutorImpl(undefined, fileService);
    service = new ChatService(chatRepo, analysisRepo, settingsService, chatActionRepo, realExecutor);

    const result = await service.approveAction('file-action-1', vi.fn());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(false);
      expect(result.value.error).toContain('Path resolves outside workspace root');
    }

    expect(chatActionRepo.updateStatus).toHaveBeenCalledWith('file-action-1', 'failed', {
      success: false,
      error: 'Path resolves outside workspace root',
    });
  });

  it('transitions file-write action through approved → executing → completed statuses', async () => {
    const action = makeFileWriteAction('write_markdown_file', 'notes/plan.md', '# Plan');

    chatActionRepo = {
      findById: vi.fn().mockResolvedValue(action),
      findByAnalysis: vi.fn().mockResolvedValue([
        { ...action, status: 'completed' },
        { ...action, id: 'file-action-2', status: 'pending' },
      ]),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateToolInput: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn(),
      deleteByAnalysis: vi.fn(),
    } as unknown as ChatActionRepository;

    const realExecutor = new ActionExecutorImpl(undefined, fileService);
    service = new ChatService(chatRepo, analysisRepo, settingsService, chatActionRepo, realExecutor);

    await service.approveAction('file-action-1', vi.fn());

    const statusCalls = vi.mocked(chatActionRepo.updateStatus).mock.calls.map((c) => c[1]);
    expect(statusCalls).toContain('approved');
    expect(statusCalls).toContain('executing');
    expect(statusCalls).toContain('completed');

    const approvedIdx = statusCalls.indexOf('approved');
    const executingIdx = statusCalls.indexOf('executing');
    const completedIdx = statusCalls.indexOf('completed');
    expect(approvedIdx).toBeLessThan(executingIdx);
    expect(executingIdx).toBeLessThan(completedIdx);
  });

  it('does not write file when file-write action is rejected', async () => {
    const action = makeFileWriteAction('write_markdown_file', 'reports/summary.md', '# Summary');

    chatActionRepo = {
      findById: vi.fn().mockResolvedValue(action),
      findByAnalysis: vi.fn().mockResolvedValue([
        { ...action, status: 'rejected' },
        { ...action, id: 'file-action-2', status: 'pending' },
      ]),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateToolInput: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn(),
      deleteByAnalysis: vi.fn(),
    } as unknown as ChatActionRepository;

    const realExecutor = new ActionExecutorImpl(undefined, fileService);
    service = new ChatService(chatRepo, analysisRepo, settingsService, chatActionRepo, realExecutor);

    const result = await service.rejectAction('file-action-1', vi.fn());

    expect(result.ok).toBe(true);
    expect(fileService.writeFile).not.toHaveBeenCalled();
    expect(chatActionRepo.updateStatus).toHaveBeenCalledWith('file-action-1', 'rejected');
  });
});
