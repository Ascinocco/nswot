import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import {
  validateWorkspacePath,
  readDirectory,
  readFileContent,
  writeFileContent,
} from './file-system';
import { DomainError } from '../domain/errors';

describe('file-system', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = join(tmpdir(), `nswot-test-${randomUUID()}`);
    mkdirSync(workspaceRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  describe('validateWorkspacePath', () => {
    it('allows valid relative paths', () => {
      const result = validateWorkspacePath(workspaceRoot, 'subdir/file.txt');
      expect(result).toBe(join(workspaceRoot, 'subdir/file.txt'));
    });

    it('allows current directory', () => {
      const result = validateWorkspacePath(workspaceRoot, '.');
      expect(result).toBe(workspaceRoot);
    });

    it('rejects path traversal with ..', () => {
      expect(() => validateWorkspacePath(workspaceRoot, '../../etc/passwd')).toThrow(DomainError);
    });

    it('rejects absolute paths outside workspace', () => {
      expect(() => validateWorkspacePath(workspaceRoot, '/etc/passwd')).toThrow(DomainError);
    });

    it('rejects paths that resolve outside workspace via symlink-like traversal', () => {
      expect(() => validateWorkspacePath(workspaceRoot, 'foo/../../..')).toThrow(DomainError);
    });
  });

  describe('readDirectory', () => {
    it('returns sorted entries with directories first', async () => {
      mkdirSync(join(workspaceRoot, 'bravo-dir'));
      mkdirSync(join(workspaceRoot, 'alpha-dir'));
      writeFileSync(join(workspaceRoot, 'charlie.txt'), 'hello');
      writeFileSync(join(workspaceRoot, 'alpha.txt'), 'world');

      const entries = await readDirectory(workspaceRoot, '.');

      expect(entries[0]!.name).toBe('alpha-dir');
      expect(entries[0]!.isDirectory).toBe(true);
      expect(entries[1]!.name).toBe('bravo-dir');
      expect(entries[1]!.isDirectory).toBe(true);
      expect(entries[2]!.name).toBe('alpha.txt');
      expect(entries[2]!.isDirectory).toBe(false);
      expect(entries[3]!.name).toBe('charlie.txt');
      expect(entries[3]!.isDirectory).toBe(false);
    });

    it('filters out .git directory', async () => {
      mkdirSync(join(workspaceRoot, '.git'));
      writeFileSync(join(workspaceRoot, 'readme.md'), '# Hello');

      const entries = await readDirectory(workspaceRoot, '.');
      expect(entries).toHaveLength(1);
      expect(entries[0]!.name).toBe('readme.md');
    });

    it('filters out node_modules', async () => {
      mkdirSync(join(workspaceRoot, 'node_modules'));
      writeFileSync(join(workspaceRoot, 'index.ts'), '');

      const entries = await readDirectory(workspaceRoot, '.');
      expect(entries).toHaveLength(1);
      expect(entries[0]!.name).toBe('index.ts');
    });

    it('filters out .env files', async () => {
      writeFileSync(join(workspaceRoot, '.env'), 'SECRET=yes');
      writeFileSync(join(workspaceRoot, '.env.local'), 'SECRET=local');
      writeFileSync(join(workspaceRoot, 'app.ts'), '');

      const entries = await readDirectory(workspaceRoot, '.');
      expect(entries).toHaveLength(1);
      expect(entries[0]!.name).toBe('app.ts');
    });

    it('shows .nswot directory in file browser', async () => {
      mkdirSync(join(workspaceRoot, '.nswot'));
      writeFileSync(join(workspaceRoot, 'data.json'), '{}');

      const entries = await readDirectory(workspaceRoot, '.');
      expect(entries).toHaveLength(2);
      expect(entries.some((e) => e.name === '.nswot')).toBe(true);
    });

    it('returns relative paths', async () => {
      mkdirSync(join(workspaceRoot, 'sub'));
      writeFileSync(join(workspaceRoot, 'sub', 'file.txt'), 'content');

      const entries = await readDirectory(workspaceRoot, 'sub');
      expect(entries[0]!.path).toBe(join('sub', 'file.txt'));
    });
  });

  describe('readFileContent / writeFileContent', () => {
    it('round-trips file content', async () => {
      const content = 'Hello, World!\nLine 2\n';
      await writeFileContent(workspaceRoot, 'test.txt', content);
      const result = await readFileContent(workspaceRoot, 'test.txt');
      expect(result).toBe(content);
    });

    it('reads existing files', async () => {
      writeFileSync(join(workspaceRoot, 'existing.md'), '# Title');
      const result = await readFileContent(workspaceRoot, 'existing.md');
      expect(result).toBe('# Title');
    });

    it('rejects path traversal on read', async () => {
      await expect(readFileContent(workspaceRoot, '../../etc/passwd')).rejects.toThrow(
        DomainError,
      );
    });

    it('rejects path traversal on write', async () => {
      await expect(
        writeFileContent(workspaceRoot, '../../tmp/evil.txt', 'bad'),
      ).rejects.toThrow(DomainError);
    });
  });
});
