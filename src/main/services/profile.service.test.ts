import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfileService } from './profile.service';
import type { ProfileRepository } from '../repositories/profile.repository';
import type { WorkspaceService } from './workspace.service';
import type { Profile } from '../domain/types';

function createMockProfileRepo(): ProfileRepository {
  const profiles = new Map<string, Profile>();
  let counter = 0;

  return {
    findByWorkspace: vi.fn(async (workspaceId: string) =>
      [...profiles.values()].filter((p) => p.workspaceId === workspaceId),
    ),
    findById: vi.fn(async (id: string) => profiles.get(id) ?? null),
    findByIds: vi.fn(async (ids: string[]) =>
      ids.map((id) => profiles.get(id)).filter(Boolean) as Profile[],
    ),
    insert: vi.fn(async (workspaceId: string, input) => {
      counter++;
      const profile: Profile = {
        id: `profile-${counter}`,
        workspaceId,
        name: input.name,
        role: input.role ?? null,
        team: input.team ?? null,
        concerns: input.concerns ?? null,
        priorities: input.priorities ?? null,
        interviewQuotes: input.interviewQuotes ?? [],
        notes: input.notes ?? null,
        sourceFile: input.sourceFile ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      profiles.set(profile.id, profile);
      return profile;
    }),
    update: vi.fn(async (id: string, input) => {
      const existing = profiles.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...input, updatedAt: new Date().toISOString() };
      profiles.set(id, updated);
      return updated;
    }),
    delete: vi.fn(async (id: string) => {
      profiles.delete(id);
    }),
    countByWorkspace: vi.fn(async (workspaceId: string) =>
      [...profiles.values()].filter((p) => p.workspaceId === workspaceId).length,
    ),
  } as unknown as ProfileRepository;
}

function createMockWorkspaceService(
  workspaceId: string | null = 'ws-1',
  workspacePath: string | null = '/test/workspace',
): WorkspaceService {
  return {
    getCurrentId: vi.fn(() => workspaceId),
    getCurrentPath: vi.fn(() => workspacePath),
    open: vi.fn(),
    getCurrent: vi.fn(),
  } as unknown as WorkspaceService;
}

describe('ProfileService', () => {
  let service: ProfileService;
  let profileRepo: ProfileRepository;
  let workspaceService: WorkspaceService;

  beforeEach(() => {
    profileRepo = createMockProfileRepo();
    workspaceService = createMockWorkspaceService();
    service = new ProfileService(profileRepo, workspaceService);
  });

  describe('list', () => {
    it('returns profiles for current workspace', async () => {
      await profileRepo.insert('ws-1', { name: 'Alice' });
      await profileRepo.insert('ws-1', { name: 'Bob' });

      const result = await service.list();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }
    });

    it('returns error when no workspace is open', async () => {
      service = new ProfileService(profileRepo, createMockWorkspaceService(null, null));
      const result = await service.list();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WORKSPACE_NOT_FOUND');
      }
    });
  });

  describe('get', () => {
    it('returns profile by ID', async () => {
      const created = await profileRepo.insert('ws-1', { name: 'Alice' });
      const result = await service.get(created.id);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('Alice');
      }
    });

    it('returns error for non-existent profile', async () => {
      const result = await service.get('non-existent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROFILE_NOT_FOUND');
      }
    });
  });

  describe('create', () => {
    it('creates a profile', async () => {
      const result = await service.create({
        name: 'Alice',
        role: 'Engineer',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('Alice');
        expect(result.value.workspaceId).toBe('ws-1');
      }
    });

    it('rejects empty name', async () => {
      const result = await service.create({ name: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROFILE_VALIDATION');
      }
    });

    it('rejects whitespace-only name', async () => {
      const result = await service.create({ name: '   ' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROFILE_VALIDATION');
      }
    });

    it('enforces 25-profile limit', async () => {
      for (let i = 0; i < 25; i++) {
        await service.create({ name: `Profile ${i}` });
      }

      const result = await service.create({ name: 'Profile 26' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROFILE_LIMIT');
      }
    });

    it('returns error when no workspace is open', async () => {
      service = new ProfileService(profileRepo, createMockWorkspaceService(null, null));
      const result = await service.create({ name: 'Alice' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WORKSPACE_NOT_FOUND');
      }
    });
  });

  describe('update', () => {
    it('updates an existing profile', async () => {
      const created = await profileRepo.insert('ws-1', { name: 'Alice' });
      const result = await service.update(created.id, {
        name: 'Alice Updated',
        role: 'Senior Engineer',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('Alice Updated');
      }
    });

    it('rejects empty name', async () => {
      const created = await profileRepo.insert('ws-1', { name: 'Alice' });
      const result = await service.update(created.id, { name: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROFILE_VALIDATION');
      }
    });

    it('returns error for non-existent profile', async () => {
      const result = await service.update('non-existent', { name: 'Test' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROFILE_NOT_FOUND');
      }
    });
  });

  describe('delete', () => {
    it('deletes an existing profile', async () => {
      const created = await profileRepo.insert('ws-1', { name: 'Alice' });
      const result = await service.delete(created.id);
      expect(result.ok).toBe(true);
    });

    it('returns error for non-existent profile', async () => {
      const result = await service.delete('non-existent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROFILE_NOT_FOUND');
      }
    });
  });
});
