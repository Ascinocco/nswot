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
      expect(result.error).toContain('authentication required');
    });

    it('rejects on timeout', async () => {
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

      await expect(
        shortExecutor.execute('create_jira_issue', {
          project: 'PROJ',
          issueType: 'Task',
          summary: 'Test',
          description: 'Desc',
        }),
      ).rejects.toThrow('timed out');
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
});
