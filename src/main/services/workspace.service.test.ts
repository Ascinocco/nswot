import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceService } from './workspace.service';
import type { WorkspaceRepository } from '../repositories/workspace.repository';
import type { PreferencesRepository } from '../repositories/preferences.repository';
import type { Workspace } from '../domain/types';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  stat: vi.fn(),
}));

import { stat } from 'fs/promises';

function createMockWorkspaceRepo(): WorkspaceRepository {
  const workspaces = new Map<string, Workspace>();
  return {
    findById: vi.fn(async (id: string) => workspaces.get(id) ?? null),
    findByPath: vi.fn(async (path: string) => {
      for (const w of workspaces.values()) {
        if (w.path === path) return w;
      }
      return null;
    }),
    insert: vi.fn(async (path: string, name: string) => {
      const workspace: Workspace = {
        id: `ws-${workspaces.size + 1}`,
        path,
        name,
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      };
      workspaces.set(workspace.id, workspace);
      return workspace;
    }),
    updateLastOpened: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  } as unknown as WorkspaceRepository;
}

function createMockPreferencesRepo(): PreferencesRepository {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => {
      const value = store.get(key);
      return value !== undefined ? { key, value } : null;
    }),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async () => {}),
    getAll: vi.fn(async () => Object.fromEntries(store)),
  } as unknown as PreferencesRepository;
}

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let workspaceRepo: WorkspaceRepository;
  let preferencesRepo: PreferencesRepository;

  beforeEach(() => {
    workspaceRepo = createMockWorkspaceRepo();
    preferencesRepo = createMockPreferencesRepo();
    service = new WorkspaceService(workspaceRepo, preferencesRepo);
  });

  describe('open', () => {
    it('creates a new workspace for a new path', async () => {
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as never);

      const result = await service.open('/test/new-workspace');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.path).toBe('/test/new-workspace');
        expect(result.value.name).toBe('new-workspace');
      }
      expect(workspaceRepo.insert).toHaveBeenCalledWith('/test/new-workspace', 'new-workspace');
    });

    it('updates lastOpened for existing workspace path', async () => {
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as never);

      await service.open('/test/existing');
      await service.open('/test/existing');

      expect(workspaceRepo.insert).toHaveBeenCalledTimes(1);
      expect(workspaceRepo.updateLastOpened).toHaveBeenCalled();
    });

    it('stores lastWorkspaceId preference', async () => {
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as never);

      const result = await service.open('/test/workspace');
      expect(result.ok).toBe(true);
      expect(preferencesRepo.set).toHaveBeenCalledWith(
        'lastWorkspaceId',
        expect.any(String),
      );
    });

    it('rejects non-absolute paths', async () => {
      const result = await service.open('relative/path');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WORKSPACE_PATH_INVALID');
      }
    });

    it('rejects non-directory paths', async () => {
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => false } as never);

      const result = await service.open('/test/file.txt');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WORKSPACE_PATH_INVALID');
      }
    });

    it('rejects non-existent paths', async () => {
      vi.mocked(stat).mockRejectedValue(new Error('ENOENT'));

      const result = await service.open('/test/nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WORKSPACE_PATH_INVALID');
      }
    });
  });

  describe('getCurrent', () => {
    it('returns null when no workspace has been opened', async () => {
      const result = await service.getCurrent();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('returns workspace after open', async () => {
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as never);
      await service.open('/test/workspace');

      const result = await service.getCurrent();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value!.path).toBe('/test/workspace');
      }
    });

    it('loads from lastWorkspaceId preference on first call', async () => {
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as never);

      // Set up: open a workspace to populate preference, then create a fresh service
      await service.open('/test/workspace');
      const firstResult = await service.getCurrent();
      expect(firstResult.ok).toBe(true);
      const workspaceId = firstResult.ok ? firstResult.value?.id : null;

      const freshService = new WorkspaceService(workspaceRepo, preferencesRepo);
      const result = await freshService.getCurrent();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value!.id).toBe(workspaceId);
      }
    });
  });

  describe('getCurrentId', () => {
    it('returns null when no workspace is open', () => {
      expect(service.getCurrentId()).toBeNull();
    });

    it('returns workspace ID after opening', async () => {
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as never);
      await service.open('/test/workspace');
      expect(service.getCurrentId()).not.toBeNull();
    });
  });
});
