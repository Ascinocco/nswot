import { readdir, readFile as fsReadFile, writeFile as fsWriteFile } from 'fs/promises';
import { realpathSync } from 'fs';
import { resolve, relative, join, basename, isAbsolute } from 'path';
import { DomainError, ERROR_CODES } from '../domain/errors';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

const IGNORED_PATTERNS = new Set(['.git', 'node_modules']);

function isIgnored(name: string): boolean {
  if (IGNORED_PATTERNS.has(name)) return true;
  if (name.startsWith('.env')) return true;
  return false;
}

export function validateWorkspacePath(workspaceRoot: string, targetPath: string): string {
  const resolved = resolve(workspaceRoot, targetPath);
  const rel = relative(workspaceRoot, resolved);
  if (rel.startsWith('..') || resolve(resolved) !== resolve(workspaceRoot, rel)) {
    throw new DomainError(
      ERROR_CODES.WORKSPACE_PATH_INVALID,
      `Path "${targetPath}" resolves outside workspace root`,
    );
  }

  // Resolve symlinks to prevent symlink-based traversal.
  // Use realpathSync on workspace root and the nearest existing ancestor of the target.
  const realRoot = realpathSync(workspaceRoot);
  const realTarget = resolveNearestRealPath(resolved);
  if (realTarget) {
    const realRel = relative(realRoot, realTarget);
    if (realRel.startsWith('..')) {
      throw new DomainError(
        ERROR_CODES.WORKSPACE_PATH_INVALID,
        `Path "${targetPath}" resolves outside workspace root via symlink`,
      );
    }
  }

  return resolved;
}

/**
 * Resolve the real path of a target, or its nearest existing ancestor.
 * Used to detect symlinks that escape the workspace boundary.
 */
function resolveNearestRealPath(targetPath: string): string | null {
  let current = targetPath;
  while (true) {
    try {
      return realpathSync(current);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return null;
      const parent = resolve(current, '..');
      if (parent === current) return null;
      current = parent;
    }
  }
}

export async function readDirectory(
  workspaceRoot: string,
  relativePath: string,
): Promise<FileEntry[]> {
  const fullPath = validateWorkspacePath(workspaceRoot, relativePath);
  const entries = await readdir(fullPath, { withFileTypes: true });

  const fileEntries: FileEntry[] = [];
  for (const entry of entries) {
    if (isIgnored(entry.name)) continue;
    fileEntries.push({
      name: entry.name,
      path: relative(workspaceRoot, join(fullPath, entry.name)),
      isDirectory: entry.isDirectory(),
    });
  }

  fileEntries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return fileEntries;
}

export async function readFileContent(
  workspaceRoot: string,
  relativePath: string,
): Promise<string> {
  const fullPath = validateWorkspacePath(workspaceRoot, relativePath);
  return fsReadFile(fullPath, 'utf-8');
}

export async function writeFileContent(
  workspaceRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const fullPath = validateWorkspacePath(workspaceRoot, relativePath);
  await fsWriteFile(fullPath, content, 'utf-8');
}

export async function writeBinaryFileContent(
  workspaceRoot: string,
  relativePath: string,
  content: Buffer,
): Promise<void> {
  const fullPath = validateWorkspacePath(workspaceRoot, relativePath);
  await fsWriteFile(fullPath, content);
}
