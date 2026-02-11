import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionExecutor } from './action-executor';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';

function createMockChildProcess() {
  const cp = {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  };
  return cp;
}

describe('ActionExecutor', () => {
  let executor: ActionExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new ActionExecutor();
  });

  describe('buildPrompt', () => {
    it('builds a prompt with tool name and details', () => {
      const prompt = executor.buildPrompt('create_jira_issue', {
        project: 'PROJ',
        issueType: 'Epic',
        summary: 'Test epic',
        description: 'Test description',
      });

      expect(prompt).toContain('ACTION: create_jira_issue');
      expect(prompt).toContain('- project: PROJ');
      expect(prompt).toContain('- issueType: Epic');
      expect(prompt).toContain('- summary: Test epic');
      expect(prompt).toContain('- description: Test description');
      expect(prompt).toContain('Execute this now.');
    });

    it('serializes array values as JSON', () => {
      const prompt = executor.buildPrompt('create_jira_issue', {
        project: 'PROJ',
        issueType: 'Task',
        summary: 'Test',
        description: 'Desc',
        labels: ['tech-debt', 'auth'],
      });

      expect(prompt).toContain('- labels: ["tech-debt","auth"]');
    });
  });

  describe('parseOutput', () => {
    it('parses valid JSON from Claude CLI envelope', () => {
      const actionResult = { success: true, id: 'PROJ-456', url: 'https://jira.example.com/PROJ-456' };
      const envelope = JSON.stringify({
        result: '```json\n' + JSON.stringify(actionResult) + '\n```',
      });

      const result = executor.parseOutput(envelope);
      expect(result.success).toBe(true);
      expect(result.id).toBe('PROJ-456');
      expect(result.url).toBe('https://jira.example.com/PROJ-456');
    });

    it('parses JSON from code fence without envelope', () => {
      const actionResult = { success: true, id: 'PROJ-789' };
      const raw = '```json\n' + JSON.stringify(actionResult) + '\n```';

      const result = executor.parseOutput(raw);
      expect(result.success).toBe(true);
      expect(result.id).toBe('PROJ-789');
    });

    it('parses raw JSON without envelope or code fence', () => {
      const actionResult = { success: true, id: 'PROJ-101' };
      const raw = JSON.stringify(actionResult);

      const result = executor.parseOutput(raw);
      expect(result.success).toBe(true);
      expect(result.id).toBe('PROJ-101');
    });

    it('uses content field if result is missing from envelope', () => {
      const actionResult = { success: true, id: 'PROJ-202' };
      const envelope = JSON.stringify({
        content: JSON.stringify(actionResult),
      });

      const result = executor.parseOutput(envelope);
      expect(result.success).toBe(true);
      expect(result.id).toBe('PROJ-202');
    });

    it('returns failure result on malformed JSON', () => {
      const raw = '```json\n{ invalid json }\n```';
      const result = executor.parseOutput(raw);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse action result');
    });

    it('returns failure result on empty output', () => {
      const result = executor.parseOutput('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse action result');
    });

    it('handles result with error field', () => {
      const actionResult = { success: false, error: 'MCP server not configured' };
      const raw = JSON.stringify(actionResult);

      const result = executor.parseOutput(raw);
      expect(result.success).toBe(false);
      expect(result.error).toBe('MCP server not configured');
    });

    it('defaults success to false when missing', () => {
      const raw = JSON.stringify({ id: 'PROJ-303' });
      const result = executor.parseOutput(raw);
      expect(result.success).toBe(false);
    });
  });

  describe('execute', () => {
    it('spawns claude with correct arguments for jira action', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      const actionResult = { success: true, id: 'PROJ-456', url: 'https://jira.example.com/PROJ-456' };
      const envelope = JSON.stringify({ result: JSON.stringify(actionResult) });

      child.stdout.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from(envelope));
      });
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(0);
        return child;
      });

      const result = await executor.execute('create_jira_issue', {
        project: 'PROJ',
        issueType: 'Epic',
        summary: 'Test',
        description: 'Test desc',
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe('PROJ-456');

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining([
          '--print',
          '--output-format',
          'json',
          '--allowedTools',
          'mcp__jira__*',
          '--model',
          'sonnet',
          '--max-turns',
          '5',
        ]),
        expect.anything(),
      );
    });

    it('uses mcp__confluence__* for confluence actions', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      const actionResult = { success: true, id: 'page-123' };
      const envelope = JSON.stringify({ result: JSON.stringify(actionResult) });

      child.stdout.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from(envelope));
      });
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(0);
        return child;
      });

      await executor.execute('create_confluence_page', {
        space: 'ENG',
        title: 'Test Page',
        content: '# Hello',
      });

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--allowedTools', 'mcp__confluence__*']),
        expect.anything(),
      );
    });

    it('uses mcp__github__* for github actions', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      const actionResult = { success: true, id: '42' };
      const envelope = JSON.stringify({ result: JSON.stringify(actionResult) });

      child.stdout.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from(envelope));
      });
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(0);
        return child;
      });

      await executor.execute('create_github_issue', {
        repo: 'owner/repo',
        title: 'Bug fix',
        body: 'Details here',
      });

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--allowedTools', 'mcp__github__*']),
        expect.anything(),
      );
    });

    it('returns failure on non-zero exit code', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      child.stdout.on.mockImplementation(() => {});
      child.stderr.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from('Error: authentication required'));
      });
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(1);
        return child;
      });

      const result = await executor.execute('create_jira_issue', {
        project: 'PROJ',
        issueType: 'Task',
        summary: 'Test',
        description: 'Desc',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('authentication failed');
    });

    it('returns failure on timeout', async () => {
      const shortExecutor = new ActionExecutor({ timeoutMs: 1 });
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      child.stdout.on.mockImplementation(() => {});
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation((event: string, handler: (err: unknown) => void) => {
        if (event === 'error') {
          const abortError = new Error('The operation was aborted');
          abortError.name = 'AbortError';
          handler(abortError);
        }
        return child;
      });

      const result = await shortExecutor.execute('create_jira_issue', {
        project: 'PROJ',
        issueType: 'Task',
        summary: 'Test',
        description: 'Desc',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('returns failure when CLI not found (ENOENT)', async () => {
      vi.mocked(spawn).mockImplementation(() => {
        const err = new Error('spawn claude ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      });

      const result = await executor.execute('create_jira_issue', {
        project: 'PROJ',
        issueType: 'Task',
        summary: 'Test',
        description: 'Desc',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Claude CLI not found');
    });

    it('classifies MCP errors in stderr', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      child.stdout.on.mockImplementation(() => {});
      child.stderr.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from('MCP server jira not configured'));
      });
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(1);
        return child;
      });

      const result = await executor.execute('create_jira_issue', {
        project: 'PROJ',
        issueType: 'Task',
        summary: 'Test',
        description: 'Desc',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('MCP server not configured');
    });

    it('classifies permission errors in stderr', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      child.stdout.on.mockImplementation(() => {});
      child.stderr.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from('403 Forbidden'));
      });
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(1);
        return child;
      });

      const result = await executor.execute('create_jira_issue', {
        project: 'PROJ',
        issueType: 'Task',
        summary: 'Test',
        description: 'Desc',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('respects custom options', async () => {
      const customExecutor = new ActionExecutor({ model: 'opus', maxTurns: 10, timeoutMs: 120_000 });
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      const envelope = JSON.stringify({ result: JSON.stringify({ success: true }) });

      child.stdout.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from(envelope));
      });
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(0);
        return child;
      });

      await customExecutor.execute('add_jira_comment', {
        issueKey: 'PROJ-123',
        comment: 'Test comment',
      });

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--model', 'opus', '--max-turns', '10']),
        expect.anything(),
      );
    });
  });

  describe('buildPrompt (action-specific)', () => {
    it('builds batch jira prompt with sequential issue list', () => {
      const prompt = executor.buildPrompt('create_jira_issues', {
        issues: [
          { project: 'PROJ', issueType: 'Epic', summary: 'Parent Epic', description: 'Desc' },
          { project: 'PROJ', issueType: 'Story', summary: 'Child Story', description: 'Desc', parentRef: '0' },
        ],
      });

      expect(prompt).toContain('batch of Jira issue creations');
      expect(prompt).toContain('1. Issue:');
      expect(prompt).toContain('2. Issue:');
      expect(prompt).toContain('parent: issue #0 from this batch');
      expect(prompt).toContain('JSON array');
    });

    it('builds confluence prompt with page content block', () => {
      const prompt = executor.buildPrompt('create_confluence_page', {
        space: 'ENG',
        title: 'SWOT Analysis Summary',
        content: '# Overview\n\nKey findings from the analysis.',
        parentPageId: 'page-123',
      });

      expect(prompt).toContain('Create a Confluence page');
      expect(prompt).toContain('space: ENG');
      expect(prompt).toContain('title: SWOT Analysis Summary');
      expect(prompt).toContain('parentPageId: page-123');
      expect(prompt).toContain('PAGE CONTENT (markdown):');
      expect(prompt).toContain('# Overview');
    });

    it('builds github PR prompt with branch context', () => {
      const prompt = executor.buildPrompt('create_github_pr', {
        repo: 'org/repo',
        title: 'Fix auth module',
        body: '## Changes\n\nFixed the auth issue.',
        head: 'fix/auth-module',
        base: 'main',
      });

      expect(prompt).toContain('Create a GitHub pull request');
      expect(prompt).toContain('repo: org/repo');
      expect(prompt).toContain('head: fix/auth-module');
      expect(prompt).toContain('base: main');
      expect(prompt).toContain('PR BODY (markdown):');
      expect(prompt).toContain('## Changes');
    });

    it('uses generic prompt for simple actions', () => {
      const prompt = executor.buildPrompt('create_jira_issue', {
        project: 'PROJ',
        issueType: 'Task',
        summary: 'Simple task',
        description: 'Do the thing',
      });

      expect(prompt).toContain('ACTION: create_jira_issue');
      expect(prompt).toContain('- project: PROJ');
      expect(prompt).toContain('Execute this now.');
    });

    it('uses generic prompt for add_jira_comment', () => {
      const prompt = executor.buildPrompt('add_jira_comment', {
        issueKey: 'PROJ-123',
        comment: 'Here is the comment',
      });

      expect(prompt).toContain('ACTION: add_jira_comment');
      expect(prompt).toContain('- issueKey: PROJ-123');
    });

    it('uses generic prompt for create_github_issue', () => {
      const prompt = executor.buildPrompt('create_github_issue', {
        repo: 'org/repo',
        title: 'Bug report',
        body: 'Something is broken',
      });

      expect(prompt).toContain('ACTION: create_github_issue');
      expect(prompt).toContain('- repo: org/repo');
    });
  });

  describe('parseBatchOutput', () => {
    it('parses successful batch result array', () => {
      const batchResult = [
        { success: true, id: 'PROJ-100', url: 'https://jira.example.com/PROJ-100' },
        { success: true, id: 'PROJ-101', url: 'https://jira.example.com/PROJ-101' },
      ];
      const raw = JSON.stringify({ result: JSON.stringify(batchResult) });

      const result = executor.parseBatchOutput(raw);
      expect(result.success).toBe(true);
      expect(result.id).toContain('PROJ-100');
      expect(result.id).toContain('PROJ-101');
    });

    it('detects partial batch failure', () => {
      const batchResult = [
        { success: true, id: 'PROJ-100', url: 'https://jira.example.com/PROJ-100' },
        { success: false, error: 'Project not found' },
      ];
      const raw = JSON.stringify({ result: JSON.stringify(batchResult) });

      const result = executor.parseBatchOutput(raw);
      expect(result.success).toBe(false);
      expect(result.id).toContain('PROJ-100');
      expect(result.error).toContain('Partial batch failure');
      expect(result.error).toContain('Project not found');
    });

    it('handles single result fallback for batch', () => {
      const singleResult = { success: true, id: 'PROJ-100' };
      const raw = JSON.stringify(singleResult);

      const result = executor.parseBatchOutput(raw);
      expect(result.success).toBe(true);
      expect(result.id).toBe('PROJ-100');
    });

    it('parses batch from code fence', () => {
      const batchResult = [{ success: true, id: 'PROJ-200' }];
      const raw = '```json\n' + JSON.stringify(batchResult) + '\n```';

      const result = executor.parseBatchOutput(raw);
      expect(result.success).toBe(true);
      expect(result.id).toContain('PROJ-200');
    });

    it('returns failure on malformed batch output', () => {
      const result = executor.parseBatchOutput('not valid json');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse batch result');
    });
  });
});
