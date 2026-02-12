import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
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
        tags: input.tags ?? [],
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

  describe('importFromDirectory', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `nswot-test-${Date.now()}`);
      mkdirSync(join(tempDir, 'profiles'), { recursive: true });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('imports all markdown files from a directory', async () => {
      writeFileSync(
        join(tempDir, 'profiles', 'alice.md'),
        '---\nname: Alice\nrole: Engineer\n---\n\n## Concerns\nScaling issues\n',
      );
      writeFileSync(
        join(tempDir, 'profiles', 'bob.md'),
        '---\nname: Bob\nrole: PM\n---\n\n## Priorities\nShip fast\n',
      );
      writeFileSync(
        join(tempDir, 'profiles', 'readme.txt'),
        'This is not a markdown file',
      );

      const svc = new ProfileService(
        profileRepo,
        createMockWorkspaceService('ws-1', tempDir),
      );

      const result = await svc.importFromDirectory('profiles');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        const names = result.value.map((p) => p.name).sort();
        expect(names).toEqual(['Alice', 'Bob']);
      }
    });

    it('returns error when no markdown files found', async () => {
      writeFileSync(join(tempDir, 'profiles', 'readme.txt'), 'Not a markdown file');

      const svc = new ProfileService(
        profileRepo,
        createMockWorkspaceService('ws-1', tempDir),
      );

      const result = await svc.importFromDirectory('profiles');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IMPORT_PARSE_ERROR');
      }
    });

    it('returns error when no workspace is open', async () => {
      const svc = new ProfileService(profileRepo, createMockWorkspaceService(null, null));
      const result = await svc.importFromDirectory('profiles');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WORKSPACE_NOT_FOUND');
      }
    });

    it('skips files that fail to parse and imports the rest', async () => {
      writeFileSync(
        join(tempDir, 'profiles', 'alice.md'),
        '---\nname: Alice\n---\n\n## Notes\nGood\n',
      );
      writeFileSync(
        join(tempDir, 'profiles', 'bad.md'),
        'No frontmatter, no name field here',
      );

      const svc = new ProfileService(
        profileRepo,
        createMockWorkspaceService('ws-1', tempDir),
      );

      const result = await svc.importFromDirectory('profiles');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.name).toBe('Alice');
      }
    });
  });
});
