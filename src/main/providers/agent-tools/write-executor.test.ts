import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WriteExecutor } from './write-executor';
import { ok, err } from '../../domain/result';
import { DomainError, ERROR_CODES } from '../../domain/errors';
import type { FileService } from '../../services/file.service';
import type { ActionExecutor } from '../actions/action-executor';

function makeMockFileService(
  writeResult: 'ok' | 'error' = 'ok',
): FileService {
  return {
    listDirectory: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(
      writeResult === 'ok'
        ? ok(undefined)
        : err(new DomainError(ERROR_CODES.FS_PERMISSION_DENIED, 'Permission denied')),
    ),
  } as unknown as FileService;
}

function makeMockActionExecutor(
  result: { success: boolean; id?: string; url?: string; error?: string } = { success: true, id: 'PROJ-123', url: 'https://jira.example.com/PROJ-123' },
): ActionExecutor {
  return {
    execute: vi.fn().mockResolvedValue(result),
  } as unknown as ActionExecutor;
}

describe('WriteExecutor', () => {
  describe('write_file', () => {
    it('writes a file successfully', async () => {
      const fileService = makeMockFileService('ok');
      const executor = new WriteExecutor(fileService);

      const result = await executor.execute('write_file', {
        path: 'reports/analysis.md',
        content: '# Analysis Report\n\nFindings...',
      });

      expect(result.content).toBeDefined();
      const parsed = JSON.parse(result.content!);
      expect(parsed.success).toBe(true);
      expect(parsed.path).toBe('reports/analysis.md');
      expect(fileService.writeFile).toHaveBeenCalledWith(
        'reports/analysis.md',
        '# Analysis Report\n\nFindings...',
      );
    });

    it('returns error when file service is not available', async () => {
      const executor = new WriteExecutor(); // no file service

      const result = await executor.execute('write_file', {
        path: 'report.md',
        content: 'content',
      });

      expect(result.content).toContain('File service not available');
    });

    it('returns error for missing path', async () => {
      const fileService = makeMockFileService('ok');
      const executor = new WriteExecutor(fileService);

      const result = await executor.execute('write_file', {
        content: 'content',
      });

      expect(result.content).toContain('requires a path string');
    });

    it('returns error for missing content', async () => {
      const fileService = makeMockFileService('ok');
      const executor = new WriteExecutor(fileService);

      const result = await executor.execute('write_file', {
        path: 'report.md',
      });

      expect(result.content).toContain('requires a content string');
    });

    it('returns error for path traversal', async () => {
      const fileService = makeMockFileService('ok');
      const executor = new WriteExecutor(fileService);

      const result = await executor.execute('write_file', {
        path: '../../../etc/passwd',
        content: 'malicious',
      });

      expect(result.content).toContain('Path traversal not allowed');
      expect(fileService.writeFile).not.toHaveBeenCalled();
    });

    it('returns error when file service write fails', async () => {
      const fileService = makeMockFileService('error');
      const executor = new WriteExecutor(fileService);

      const result = await executor.execute('write_file', {
        path: 'report.md',
        content: 'content',
      });

      expect(result.content).toContain('Permission denied');
    });
  });

  describe('Phase 3c action tools', () => {
    it('delegates create_jira_issue to ActionExecutor', async () => {
      const actionExecutor = makeMockActionExecutor();
      const executor = new WriteExecutor(undefined, actionExecutor);

      const input = { project: 'PROJ', issueType: 'Story', summary: 'Test', description: 'Desc' };
      const result = await executor.execute('create_jira_issue', input);

      const parsed = JSON.parse(result.content!);
      expect(parsed.success).toBe(true);
      expect(parsed.id).toBe('PROJ-123');
      expect(actionExecutor.execute).toHaveBeenCalledWith('create_jira_issue', input);
    });

    it('delegates create_confluence_page to ActionExecutor', async () => {
      const actionExecutor = makeMockActionExecutor({ success: true, id: 'page-1', url: 'https://wiki.example.com/page-1' });
      const executor = new WriteExecutor(undefined, actionExecutor);

      const result = await executor.execute('create_confluence_page', {
        space: 'DEV',
        title: 'Report',
        content: 'Content',
      });

      const parsed = JSON.parse(result.content!);
      expect(parsed.success).toBe(true);
      expect(parsed.id).toBe('page-1');
    });

    it('delegates file write tools to ActionExecutor', async () => {
      const actionExecutor = makeMockActionExecutor({ success: true, id: 'report.md' });
      const executor = new WriteExecutor(undefined, actionExecutor);

      const result = await executor.execute('write_markdown_file', {
        path: 'reports/summary.md',
        content: '# Summary',
      });

      const parsed = JSON.parse(result.content!);
      expect(parsed.success).toBe(true);
      expect(actionExecutor.execute).toHaveBeenCalledWith('write_markdown_file', expect.any(Object));
    });

    it('returns error when ActionExecutor fails', async () => {
      const actionExecutor = makeMockActionExecutor({ success: false, error: 'Auth failed' });
      const executor = new WriteExecutor(undefined, actionExecutor);

      const result = await executor.execute('create_jira_issue', {
        project: 'PROJ',
        issueType: 'Bug',
        summary: 'Test',
        description: 'Desc',
      });

      const parsed = JSON.parse(result.content!);
      expect(parsed.error).toBe('Auth failed');
    });

    it('returns error when ActionExecutor is not available', async () => {
      const executor = new WriteExecutor(); // no action executor

      const result = await executor.execute('create_jira_issue', {});

      expect(result.content).toContain('Action executor not available');
    });
  });

  describe('unknown tool', () => {
    it('returns error for unknown write tool name', async () => {
      const executor = new WriteExecutor();

      const result = await executor.execute('unknown_write_tool', {});

      expect(result.content).toContain('Unknown write tool');
    });
  });
});

describe('ToolExecutorRouter write dispatch', () => {
  it('routes write tools to WriteExecutor', async () => {
    const { ToolExecutorRouter } = await import('./tool-executor-router');
    const { RenderExecutor } = await import('./render-executor');
    const renderExecutor = new RenderExecutor();
    const fileService = makeMockFileService('ok');
    const writeExecutor = new WriteExecutor(fileService);
    const router = new ToolExecutorRouter(renderExecutor, undefined, writeExecutor);

    const result = await router.execute('write_file', 'write', {
      path: 'report.md',
      content: '# Report',
    });

    const parsed = JSON.parse(result.content!);
    expect(parsed.success).toBe(true);
  });
});

describe('createAgentHarness with write tools', () => {
  it('creates an AgentService with render, read, and write tools registered', async () => {
    const { createAgentHarness } = await import('./agent-harness-factory');

    const agentService = createAgentHarness({
      llmProvider: {
        name: 'mock',
        listModels: vi.fn(),
        createChatCompletion: vi.fn(),
      },
      comparisonService: { compare: vi.fn() } as any,
      integrationRepo: { findByWorkspaceAndProvider: vi.fn() } as any,
      integrationCacheRepo: { findByType: vi.fn(), findEntry: vi.fn() } as any,
      profileRepo: { findByWorkspace: vi.fn() } as any,
      workspaceService: { getCurrentId: vi.fn() } as any,
      fileService: { writeFile: vi.fn() } as any,
      actionExecutor: { execute: vi.fn() } as any,
    });

    expect(agentService).toBeDefined();
    expect(agentService.isRunning).toBe(false);
  });
});
