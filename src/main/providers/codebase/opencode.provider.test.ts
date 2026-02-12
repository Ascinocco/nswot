import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenCodeProvider } from './opencode.provider';
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

describe('OpenCodeProvider', () => {
  let provider: OpenCodeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenCodeProvider();
  });

  it('has name "opencode"', () => {
    expect(provider.name).toBe('opencode');
  });

  describe('isAvailable', () => {
    it('returns true when opencode is in PATH', async () => {
      vi.mocked(execFile).mockImplementation(((
        cmd: string,
        args: string[],
        callback: (err: Error | null) => void,
      ) => {
        if (cmd === 'which' && args[0] === 'opencode') {
          callback(null);
        }
      }) as typeof execFile);

      const result = await provider.isAvailable();
      expect(result).toBe(true);
    });

    it('returns false when opencode is not in PATH', async () => {
      vi.mocked(execFile).mockImplementation(((
        cmd: string,
        _args: string[],
        callback: (err: Error | null) => void,
      ) => {
        if (cmd === 'which') {
          callback(new Error('not found'));
        }
      }) as typeof execFile);

      const result = await provider.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('checkPrerequisites', () => {
    it('returns cli=true when opencode exists', async () => {
      vi.mocked(execFile).mockImplementation(((
        _cmd: string,
        _args: string[],
        callback: (err: Error | null) => void,
      ) => {
        callback(null);
      }) as typeof execFile);

      const result = await provider.checkPrerequisites();
      expect(result.cli).toBe(true);
      expect(result.cliAuthenticated).toBe(true);
      expect(result.git).toBe(true);
      expect(result.jiraMcp).toBe(false);
    });

    it('returns cli=false when opencode is not found', async () => {
      vi.mocked(execFile).mockImplementation(((
        cmd: string,
        args: string[],
        callback: (err: Error | null) => void,
      ) => {
        if (cmd === 'which' && args[0] === 'opencode') {
          callback(new Error('not found'));
        } else {
          callback(null);
        }
      }) as typeof execFile);

      const result = await provider.checkPrerequisites();
      expect(result.cli).toBe(false);
      expect(result.cliAuthenticated).toBe(false);
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
  });

  describe('analyze', () => {
    const options: CodebaseAnalysisOptions = {
      shallow: true,
      depth: 'standard',
      model: 'sonnet',
      maxTurns: 30,
      timeoutMs: 2_400_000,
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

    function makeResultEvent(analysis: object): string {
      return JSON.stringify({
        type: 'result',
        result: '```json\n' + JSON.stringify(analysis) + '\n```',
      }) + '\n';
    }

    it('returns parsed analysis on success', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      child.stdout.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from(makeResultEvent(validAnalysis)));
      });
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(0);
        return child;
      });

      const result = await provider.analyze('/tmp/repo', 'analyze this', options);
      expect(result.repo).toBe('owner/repo');
      expect(spawn).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--print', '--output-format', 'stream-json']),
        expect.objectContaining({
          cwd: '/tmp/repo',
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      );
    });

    it('throws on non-zero exit code', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      child.stdout.on.mockImplementation(() => {});
      child.stderr.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from('Error: something went wrong'));
      });
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(1);
        return child;
      });

      await expect(
        provider.analyze('/tmp/repo', 'analyze this', options),
      ).rejects.toThrow('something went wrong');
    });

    it('throws timeout error when process exceeds timeoutMs', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      child.stdout.on.mockImplementation(() => {});
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation(() => child);

      const shortTimeoutOptions = { ...options, timeoutMs: 10 };
      await expect(
        provider.analyze('/tmp/repo', 'analyze this', shortTimeoutOptions),
      ).rejects.toThrow('timed out');
    });

    it('salvages partial output on timeout', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      child.stdout.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from(makeResultEvent(validAnalysis)));
      });
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation(() => child);

      const shortTimeoutOptions = { ...options, timeoutMs: 10 };
      const result = await provider.analyze('/tmp/repo', 'analyze this', shortTimeoutOptions);
      expect(result.repo).toBe('owner/repo');
      expect(result.partial).toBe(true);
    });

    it('throws parseError when no output is produced', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      child.stdout.on.mockImplementation(() => {});
      child.stderr.on.mockImplementation(() => {});
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(0);
        return child;
      });

      await expect(
        provider.analyze('/tmp/repo', 'analyze this', options),
      ).rejects.toThrow('no output');
    });

    it('forwards stderr lines to onProgress', async () => {
      const child = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      child.stdout.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from(makeResultEvent(validAnalysis)));
      });
      child.stderr.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
        if (event === 'data') handler(Buffer.from('Initializing...\nScanning files...\n'));
      });
      child.on.mockImplementation((event: string, handler: (codeOrErr: unknown) => void) => {
        if (event === 'close') handler(0);
        return child;
      });

      const progressCalls: string[] = [];
      await provider.analyze('/tmp/repo', 'analyze this', options, false, (msg) => {
        progressCalls.push(msg);
      });

      expect(progressCalls.some((m) => m.includes('Initializing'))).toBe(true);
      expect(progressCalls.some((m) => m.includes('Scanning files'))).toBe(true);
    });
  });

  describe('parseOutput', () => {
    const validAnalysis = {
      repo: 'owner/repo',
      analyzedAt: '2024-01-01T00:00:00.000Z',
      architecture: { summary: 'Clean', modules: ['api'], concerns: [] },
      quality: { summary: 'Good', strengths: ['tests'], weaknesses: [] },
      technicalDebt: { summary: 'Low', items: [] },
      risks: { summary: 'Low', items: [] },
      jiraCrossReference: null,
    };

    it('parses raw JSON', () => {
      const result = provider.parseOutput(JSON.stringify(validAnalysis));
      expect(result.repo).toBe('owner/repo');
    });

    it('parses JSON from code fence', () => {
      const raw = '```json\n' + JSON.stringify(validAnalysis) + '\n```';
      const result = provider.parseOutput(raw);
      expect(result.repo).toBe('owner/repo');
    });

    it('parses JSON from envelope', () => {
      const envelope = JSON.stringify({ result: JSON.stringify(validAnalysis) });
      const result = provider.parseOutput(envelope);
      expect(result.repo).toBe('owner/repo');
    });

    it('throws on invalid JSON', () => {
      expect(() => provider.parseOutput('not json')).toThrow('Failed to parse');
    });

    it('throws when required fields are missing', () => {
      expect(() => provider.parseOutput(JSON.stringify({ repo: 'test' }))).toThrow(
        'Missing required fields',
      );
    });
  });
});
