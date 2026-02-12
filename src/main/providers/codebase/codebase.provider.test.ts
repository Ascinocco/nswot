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

      // stream-json format: one JSON event per line
      const resultEvent = JSON.stringify({
        type: 'result',
        result: '```json\n' + JSON.stringify(validAnalysis) + '\n```',
      });

      child.stdout.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from(resultEvent + '\n'));
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
        expect.arrayContaining(['--print', '--output-format', 'stream-json']),
        expect.objectContaining({ cwd: '/tmp/repo' }),
      );
    });

    it('includes mcp__jira in allowedTools when jiraMcpAvailable is true', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      const resultEvent = JSON.stringify({
        type: 'result',
        result: '```json\n' + JSON.stringify(validAnalysis) + '\n```',
      });

      child.stdout.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from(resultEvent + '\n'));
      });
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(0);
        return child;
      });

      await provider.analyze('/tmp/repo', 'analyze this', options, true);

      const spawnCall = vi.mocked(spawn).mock.calls[0]!;
      const args = spawnCall[1] as string[];
      const toolsIdx = args.indexOf('--allowedTools');
      const toolsValue = args[toolsIdx + 1]!;
      expect(toolsValue).toContain('mcp__jira');
    });

    it('excludes mcp__jira from allowedTools when jiraMcpAvailable is false', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      const resultEvent = JSON.stringify({
        type: 'result',
        result: '```json\n' + JSON.stringify(validAnalysis) + '\n```',
      });

      child.stdout.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from(resultEvent + '\n'));
      });
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(0);
        return child;
      });

      await provider.analyze('/tmp/repo', 'analyze this', options, false);

      const spawnCall = vi.mocked(spawn).mock.calls[0]!;
      const args = spawnCall[1] as string[];
      const toolsIdx = args.indexOf('--allowedTools');
      const toolsValue = args[toolsIdx + 1]!;
      expect(toolsValue).not.toContain('mcp__jira');
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
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
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

    it('invokes onProgress with tool call summaries from stream events', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      const toolEvent = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Read', input: { file_path: 'src/index.ts' } },
            { type: 'tool_use', name: 'Grep', input: { pattern: 'TODO' } },
          ],
        },
      });
      const resultEvent = JSON.stringify({
        type: 'result',
        result: '```json\n' + JSON.stringify(validAnalysis) + '\n```',
      });

      child.stdout.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') {
          handler(Buffer.from(toolEvent + '\n' + resultEvent + '\n'));
        }
      });
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(0);
        return child;
      });

      const progressCalls: string[] = [];
      await provider.analyze('/tmp/repo', 'analyze this', options, false, (msg) => {
        progressCalls.push(msg);
      });

      expect(progressCalls).toHaveLength(2);
      expect(progressCalls[0]).toContain('Reading');
      expect(progressCalls[0]).toContain('src/index.ts');
      expect(progressCalls[1]).toContain('Grepping');
      expect(progressCalls[1]).toContain('TODO');
    });
  });

  describe('parseOutput — various repo sizes and languages', () => {
    it('parses large analysis with many tech debt items', () => {
      const largeAnalysis = {
        repo: 'org/monorepo',
        analyzedAt: '2024-06-15T12:00:00.000Z',
        architecture: {
          summary: 'Monorepo with 12 packages',
          modules: ['api', 'web', 'mobile', 'shared', 'auth', 'billing', 'notifications', 'analytics', 'admin', 'cli', 'docs', 'infra'],
          concerns: [
            'Circular dependency between packages/api and packages/shared via @org/types',
            'No clear API boundary between packages/web and packages/admin',
          ],
        },
        quality: {
          summary: 'Mixed coverage across packages',
          strengths: ['packages/shared has 95% test coverage', 'packages/auth has comprehensive integration tests'],
          weaknesses: ['packages/billing has 12% test coverage', 'packages/mobile has no test configuration'],
        },
        technicalDebt: {
          summary: '47 high-severity items across packages',
          items: Array.from({ length: 20 }, (_, i) => ({
            description: `Legacy pattern in module ${i}`,
            location: `packages/api/src/module-${i}.ts`,
            severity: i < 5 ? 'high' : i < 12 ? 'medium' : 'low',
            evidence: `TODO comment at line ${i * 10 + 1}`,
          })),
        },
        risks: {
          summary: 'Several high-risk dependencies',
          items: ['moment.js is deprecated, used in 8 packages', 'No lockfile consistency across packages'],
        },
        jiraCrossReference: null,
      };

      const raw = '```json\n' + JSON.stringify(largeAnalysis) + '\n```';
      const result = provider.parseOutput(raw);
      expect(result.architecture.modules).toHaveLength(12);
      expect(result.technicalDebt.items).toHaveLength(20);
    });

    it('parses analysis for a Python/Go project without Node-specific fields', () => {
      const pythonAnalysis = {
        repo: 'company/ml-pipeline',
        analyzedAt: '2024-03-01T00:00:00.000Z',
        architecture: {
          summary: 'Python ML pipeline with FastAPI service layer',
          modules: ['pipeline', 'models', 'api', 'data', 'utils'],
          concerns: ['No dependency injection — all imports are direct'],
        },
        quality: {
          summary: 'Good pytest coverage for models, weak for API',
          strengths: ['models/ has 88% coverage with pytest-cov'],
          weaknesses: ['api/ has no test files', 'No type annotations in utils/'],
        },
        technicalDebt: {
          summary: 'Moderate debt in data layer',
          items: [{
            description: 'Raw SQL strings in data access layer',
            location: 'src/data/queries.py',
            severity: 'medium' as const,
            evidence: '23 raw SQL strings found via grep',
          }],
        },
        risks: {
          summary: 'Pinned dependency versions are 2 years old',
          items: ['tensorflow==2.9.0 has known CVEs'],
        },
        jiraCrossReference: null,
      };

      const raw = JSON.stringify(pythonAnalysis);
      const result = provider.parseOutput(raw);
      expect(result.repo).toBe('company/ml-pipeline');
      expect(result.architecture.modules).toContain('pipeline');
    });

    it('parses analysis with Jira cross-reference data', () => {
      const analysisWithJira = {
        repo: 'org/service',
        analyzedAt: '2024-06-01T00:00:00.000Z',
        architecture: { summary: 'Microservice', modules: ['api'], concerns: [] },
        quality: { summary: 'Moderate', strengths: [], weaknesses: [] },
        technicalDebt: { summary: 'Low', items: [] },
        risks: { summary: 'Low', items: [] },
        jiraCrossReference: {
          summary: 'Found 3 correlations between code issues and Jira tickets',
          correlations: [
            'PROJ-456: auth module test gaps correlate with open bug about login failures',
            'PROJ-789: deprecated API endpoint in src/api/v1/ matches migration story',
            'PROJ-123: high churn in src/billing/ correlates with 5 open bugs',
          ],
        },
      };

      const raw = '```json\n' + JSON.stringify(analysisWithJira) + '\n```';
      const result = provider.parseOutput(raw);
      expect(result.jiraCrossReference).not.toBeNull();
      expect(result.jiraCrossReference!.correlations).toHaveLength(3);
    });

    it('handles analysis with empty arrays gracefully', () => {
      const minimalAnalysis = {
        repo: 'user/tiny-lib',
        analyzedAt: '2024-01-01T00:00:00.000Z',
        architecture: { summary: 'Single file library', modules: [], concerns: [] },
        quality: { summary: 'No tests found', strengths: [], weaknesses: [] },
        technicalDebt: { summary: 'None found', items: [] },
        risks: { summary: 'None', items: [] },
        jiraCrossReference: null,
      };

      const raw = JSON.stringify(minimalAnalysis);
      const result = provider.parseOutput(raw);
      expect(result.architecture.modules).toHaveLength(0);
      expect(result.technicalDebt.items).toHaveLength(0);
    });
  });

  describe('cloneOrPull — shallow vs full clone', () => {
    it('clones with --depth 1 when shallow is true', async () => {
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

      const spawnCall = vi.mocked(spawn).mock.calls[0]!;
      const args = spawnCall[1] as string[];
      expect(args).toContain('--depth');
      expect(args).toContain('1');
    });

    it('clones without --depth when shallow is false (full clone)', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      child.stdout.on.mockImplementation(() => {});
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(0);
        return child;
      });

      await provider.cloneOrPull('owner/repo', '/tmp/repos/owner/repo', 'pat-123', false);

      const spawnCall = vi.mocked(spawn).mock.calls[0]!;
      const args = spawnCall[1] as string[];
      expect(args).not.toContain('--depth');
    });
  });
});
