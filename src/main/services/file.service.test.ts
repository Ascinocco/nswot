import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileService } from './file.service';
import type { WorkspaceService } from './workspace.service';

// Mock the file-system infrastructure
vi.mock('../infrastructure/file-system', () => ({
  readDirectory: vi.fn(async () => [
    { name: 'file.txt', path: 'file.txt', isDirectory: false },
  ]),
  readFileContent: vi.fn(async () => 'file content'),
  writeFileContent: vi.fn(async () => {}),
}));

import { readDirectory, readFileContent, writeFileContent } from '../infrastructure/file-system';

function createMockWorkspaceService(path: string | null): WorkspaceService {
  return {
    getCurrentId: vi.fn(() => (path ? 'ws-1' : null)),
    getCurrentPath: vi.fn(() => path),
    open: vi.fn(),
    getCurrent: vi.fn(),
  } as unknown as WorkspaceService;
}

describe('FileService', () => {
  let service: FileService;

  describe('when workspace is open', () => {
    beforeEach(() => {
      service = new FileService(createMockWorkspaceService('/test/workspace'));
      vi.clearAllMocks();
    });

    it('delegates listDirectory to readDirectory', async () => {
      const result = await service.listDirectory('subdir');
      expect(result.ok).toBe(true);
      expect(readDirectory).toHaveBeenCalledWith('/test/workspace', 'subdir');
    });

    it('delegates readFile to readFileContent', async () => {
      const result = await service.readFile('file.txt');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('file content');
      }
      expect(readFileContent).toHaveBeenCalledWith('/test/workspace', 'file.txt');
    });

    it('delegates writeFile to writeFileContent', async () => {
      const result = await service.writeFile('file.txt', 'new content');
      expect(result.ok).toBe(true);
      expect(writeFileContent).toHaveBeenCalledWith('/test/workspace', 'file.txt', 'new content');
    });
  });

  describe('when no workspace is open', () => {
    beforeEach(() => {
      service = new FileService(createMockWorkspaceService(null));
    });

    it('rejects listDirectory', async () => {
      const result = await service.listDirectory('.');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WORKSPACE_NOT_FOUND');
      }
    });

    it('rejects readFile', async () => {
      const result = await service.readFile('file.txt');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WORKSPACE_NOT_FOUND');
      }
    });

    it('rejects writeFile', async () => {
      const result = await service.writeFile('file.txt', 'content');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WORKSPACE_NOT_FOUND');
      }
    });
  });
});
