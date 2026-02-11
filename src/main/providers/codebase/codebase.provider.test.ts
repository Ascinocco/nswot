import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodebaseProvider } from './codebase.provider';
import type { CodebaseAnalysisOptions } from './codebase.types';

// Mock child_process
vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
}));

import { execFile, spawn } from 'child_process';
import { existsSync } from 'fs';

function createMockChildProcess() {
  const cp = {
    stdout: {
      on: vi.fn(),
    },
    stderr: {
      on: vi.fn(),
    },
    on: vi.fn(),
    kill: vi.fn(),
  };
  return cp;
}

describe('CodebaseProvider', () => {
  let provider: CodebaseProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CodebaseProvider();
  });

  describe('parseOutput', () => {
    const validAnalysis = {
      repo: 'owner/repo',
      analyzedAt: '2024-01-01T00:00:00.000Z',
      architecture: {
        summary: 'Clean architecture',
        modules: ['api', 'core'],
        concerns: ['coupling in api module'],
      },
      quality: {
        summary: 'Good test coverage',
        strengths: ['80% coverage'],
        weaknesses: ['no integration tests'],
      },
      technicalDebt: {
        summary: 'Moderate debt',
        items: [
          {
            description: 'Legacy auth module',
            location: 'src/auth/',
            severity: 'high',
            evidence: 'TODO comments in auth.ts',
          },
        ],
      },
      risks: {
        summary: 'Low risk',
        items: ['Single maintainer bus factor'],
      },
      jiraCrossReference: null,
    };

    it('parses valid JSON from Claude CLI envelope', () => {
      const envelope = JSON.stringify({
        result: '```json\n' + JSON.stringify(validAnalysis) + '\n```',
      });

      const result = provider.parseOutput(envelope);
      expect(result.repo).toBe('owner/repo');
      expect(result.architecture.modules).toEqual(['api', 'core']);
      expect(result.quality.strengths).toHaveLength(1);
    });

    it('parses JSON from code fence without envelope', () => {
      const raw = '```json\n' + JSON.stringify(validAnalysis) + '\n```';
      const result = provider.parseOutput(raw);
      expect(result.repo).toBe('owner/repo');
    });

    it('parses raw JSON without envelope or code fence', () => {
      const raw = JSON.stringify(validAnalysis);
      const result = provider.parseOutput(raw);
      expect(result.repo).toBe('owner/repo');
    });

    it('uses content field if result is missing', () => {
      const envelope = JSON.stringify({
        content: '```json\n' + JSON.stringify(validAnalysis) + '\n```',
      });

      const result = provider.parseOutput(envelope);
      expect(result.repo).toBe('owner/repo');
    });

    it('throws with parseError flag on malformed JSON', () => {
      const raw = '```json\n{ invalid json }\n```';
      try {
        provider.parseOutput(raw);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('Failed to parse');
        expect((error as { parseError: boolean }).parseError).toBe(true);
      }
    });

    it('throws with parseError flag on empty output', () => {
      try {
        provider.parseOutput('');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('Failed to parse');
        expect((error as { parseError: boolean }).parseError).toBe(true);
      }
    });

    it('throws with parseError flag when required fields are missing', () => {
      const incomplete = JSON.stringify({ repo: 'owner/repo' });
      try {
        provider.parseOutput(incomplete);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('Missing required fields');
        expect((error as { parseError: boolean }).parseError).toBe(true);
      }
    });
  });

  describe('checkPrerequisites', () => {
    it('returns all true when everything is available', async () => {
      // Mock 'which claude' success
      vi.mocked(execFile).mockImplementation(((
        cmd: string,
        args: string[],
        optionsOrCallback: unknown,
        maybeCallback?: unknown,
      ) => {
        const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
        (callback as (err: Error | null) => void)(null);
      }) as typeof execFile);

      // Mock 'claude mcp list' for jiraMcp check
      const mcpChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mcpChild as unknown as ReturnType<typeof spawn>);

      // Simulate stdout data and close for mcp list
      mcpChild.stdout.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') {
          handler(Buffer.from('jira-server  local\n'));
        }
      });
      mcpChild.on.mockImplementation((event: string, handler: (code: number) => void) => {
        if (event === 'close') {
          handler(0);
        }
        return mcpChild;
      });

      const result = await provider.checkPrerequisites();
      expect(result.cli).toBe(true);
      expect(result.git).toBe(true);
      expect(result.cliAuthenticated).toBe(true);
      expect(result.jiraMcp).toBe(true);
    });

    it('returns cli=false when claude is not found', async () => {
      vi.mocked(execFile).mockImplementation(((
        cmd: string,
        args: string[],
        optionsOrCallback: unknown,
        maybeCallback?: unknown,
      ) => {
        const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
        if (cmd === 'which' && args[0] === 'claude') {
          (callback as (err: Error | null) => void)(new Error('not found'));
        } else {
          (callback as (err: Error | null) => void)(null);
        }
      }) as typeof execFile);

      const result = await provider.checkPrerequisites();
      expect(result.cli).toBe(false);
      expect(result.cliAuthenticated).toBe(false);
      expect(result.jiraMcp).toBe(false);
    });

    it('returns git=false when git is not found', async () => {
      vi.mocked(execFile).mockImplementation(((
        cmd: string,
        args: string[],
        optionsOrCallback: unknown,
        maybeCallback?: unknown,
      ) => {
        const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
        if (cmd === 'which' && args[0] === 'git') {
          (callback as (err: Error | null) => void)(new Error('not found'));
        } else {
          (callback as (err: Error | null) => void)(null);
        }
      }) as typeof execFile);

      // Mock spawn for mcp list
      const mcpChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mcpChild as unknown as ReturnType<typeof spawn>);
      mcpChild.stdout.on.mockImplementation(() => {});
      mcpChild.on.mockImplementation((event: string, handler: (code: number) => void) => {
        if (event === 'close') handler(0);
        return mcpChild;
      });

      const result = await provider.checkPrerequisites();
      expect(result.git).toBe(false);
      expect(result.cli).toBe(true);
    });
  });

  describe('cloneOrPull', () => {
    it('clones when target directory does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      child.stdout.on.mockImplementation(() => {});
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(0);
        return child;
      });

      await provider.cloneOrPull('owner/repo', '/tmp/repos/owner/repo', 'pat-123', true);

      expect(spawn).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['clone', '--depth', '1']),
        expect.anything(),
      );
    });

    it('pulls when target directory already exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      child.stdout.on.mockImplementation(() => {});
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(0);
        return child;
      });

      await provider.cloneOrPull('owner/repo', '/tmp/repos/owner/repo', 'pat-123', true);

      expect(spawn).toHaveBeenCalledWith(
        'git',
        ['pull', '--ff-only'],
        expect.objectContaining({ cwd: '/tmp/repos/owner/repo' }),
      );
    });

    it('throws when clone fails with non-zero exit', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      child.stdout.on.mockImplementation(() => {});
      child.stderr.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from('fatal: repo not found'));
      });
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(128);
        return child;
      });

      await expect(
        provider.cloneOrPull('owner/repo', '/tmp/repos/owner/repo', 'pat-123', true),
      ).rejects.toThrow('git clone failed');
    });
  });

  describe('analyze', () => {
    const options: CodebaseAnalysisOptions = {
      shallow: true,
      model: 'sonnet',
      maxTurns: 30,
      timeoutMs: 300_000,
    };

    const validAnalysis = {
      repo: 'owner/repo',
      analyzedAt: '2024-01-01',
      architecture: { summary: 'ok', modules: [], concerns: [] },
      quality: { summary: 'ok', strengths: [], weaknesses: [] },
      technicalDebt: { summary: 'ok', items: [] },
      risks: { summary: 'ok', items: [] },
      jiraCrossReference: null,
    };

    it('returns parsed analysis on success', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      const envelope = JSON.stringify({
        result: '```json\n' + JSON.stringify(validAnalysis) + '\n```',
      });

      child.stdout.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from(envelope));
      });
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(0);
        return child;
      });

      const result = await provider.analyze('/tmp/repo', 'analyze this', options);
      expect(result.repo).toBe('owner/repo');
      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--print', '--output-format', 'json']),
        expect.objectContaining({ cwd: '/tmp/repo' }),
      );
    });

    it('throws on non-zero exit code', async () => {
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

      await expect(
        provider.analyze('/tmp/repo', 'analyze this', options),
      ).rejects.toThrow('authentication required');
    });

    it('throws timeout error when process exceeds timeoutMs', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      child.stdout.on.mockImplementation(() => {});
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation((event: string, handler: (err: unknown) => void) => {
        if (event === 'error') {
          // Simulate AbortError
          const abortError = new Error('The operation was aborted');
          abortError.name = 'AbortError';
          handler(abortError);
        }
        return child;
      });

      const shortTimeoutOptions = { ...options, timeoutMs: 1 };
      await expect(
        provider.analyze('/tmp/repo', 'analyze this', shortTimeoutOptions),
      ).rejects.toThrow('timed out');
    });
  });
});
