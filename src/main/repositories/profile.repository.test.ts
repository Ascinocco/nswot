import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../test/helpers/test-db';
import { ProfileRepository } from './profile.repository';
import { WorkspaceRepository } from './workspace.repository';
import type Database from 'better-sqlite3';

describe('ProfileRepository', () => {
  let db: Database.Database;
  let repo: ProfileRepository;
  let workspaceId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    repo = new ProfileRepository(db);
    const workspaceRepo = new WorkspaceRepository(db);
    const workspace = await workspaceRepo.insert('/test/workspace', 'test-workspace');
    workspaceId = workspace.id;
  });

  describe('insert and findById', () => {
    it('creates a profile and retrieves it', async () => {
      const profile = await repo.insert(workspaceId, {
        name: 'Jane Doe',
        role: 'Staff Engineer',
        team: 'Platform',
        concerns: 'Scaling issues',
        priorities: 'Reliability',
        interviewQuotes: ['We need better monitoring', 'Scaling is our top priority'],
        notes: 'Key stakeholder',
      });

      expect(profile.name).toBe('Jane Doe');
      expect(profile.role).toBe('Staff Engineer');
      expect(profile.team).toBe('Platform');
      expect(profile.interviewQuotes).toEqual([
        'We need better monitoring',
        'Scaling is our top priority',
      ]);

      const found = await repo.findById(profile.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Jane Doe');
      expect(found!.interviewQuotes).toEqual([
        'We need better monitoring',
        'Scaling is our top priority',
      ]);
    });

    it('returns null for non-existent profile', async () => {
      const found = await repo.findById('non-existent');
      expect(found).toBeNull();
    });

    it('handles empty optional fields', async () => {
      const profile = await repo.insert(workspaceId, { name: 'Minimal Profile' });
      expect(profile.role).toBeNull();
      expect(profile.team).toBeNull();
      expect(profile.concerns).toBeNull();
      expect(profile.interviewQuotes).toEqual([]);
    });
  });

  describe('findByWorkspace', () => {
    it('returns profiles for the given workspace only', async () => {
      const workspaceRepo = new WorkspaceRepository(db);
      const workspace2 = await workspaceRepo.insert('/test/other', 'other');

      await repo.insert(workspaceId, { name: 'Profile A' });
      await repo.insert(workspaceId, { name: 'Profile B' });
      await repo.insert(workspace2.id, { name: 'Profile C' });

      const profiles = await repo.findByWorkspace(workspaceId);
      expect(profiles).toHaveLength(2);
      expect(profiles.map((p) => p.name).sort()).toEqual(['Profile A', 'Profile B']);
    });

    it('returns empty array when no profiles exist', async () => {
      const profiles = await repo.findByWorkspace(workspaceId);
      expect(profiles).toEqual([]);
    });
  });

  describe('findByIds', () => {
    it('returns profiles matching given IDs', async () => {
      const p1 = await repo.insert(workspaceId, { name: 'One' });
      await repo.insert(workspaceId, { name: 'Two' });
      const p3 = await repo.insert(workspaceId, { name: 'Three' });

      const found = await repo.findByIds([p1.id, p3.id]);
      expect(found).toHaveLength(2);
      expect(found.map((p) => p.name).sort()).toEqual(['One', 'Three']);
    });

    it('returns empty array for empty IDs', async () => {
      const found = await repo.findByIds([]);
      expect(found).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates profile fields', async () => {
      const profile = await repo.insert(workspaceId, {
        name: 'Original',
        role: 'Engineer',
      });

      const updated = await repo.update(profile.id, {
        name: 'Updated',
        role: 'Senior Engineer',
        interviewQuotes: ['New quote'],
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated');
      expect(updated!.role).toBe('Senior Engineer');
      expect(updated!.interviewQuotes).toEqual(['New quote']);
    });

    it('updates updated_at timestamp', async () => {
      const profile = await repo.insert(workspaceId, { name: 'Test' });
      const originalUpdatedAt = profile.updatedAt;

      // Small delay to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await repo.update(profile.id, { name: 'Updated' });
      expect(updated!.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('returns null for non-existent profile', async () => {
      const result = await repo.update('non-existent', { name: 'Test' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('removes the profile', async () => {
      const profile = await repo.insert(workspaceId, { name: 'To Delete' });
      await repo.delete(profile.id);
      const found = await repo.findById(profile.id);
      expect(found).toBeNull();
    });
  });

  describe('countByWorkspace', () => {
    it('returns accurate count', async () => {
      expect(await repo.countByWorkspace(workspaceId)).toBe(0);
      await repo.insert(workspaceId, { name: 'One' });
      expect(await repo.countByWorkspace(workspaceId)).toBe(1);
      await repo.insert(workspaceId, { name: 'Two' });
      expect(await repo.countByWorkspace(workspaceId)).toBe(2);
    });

    it('counts only profiles in the given workspace', async () => {
      const workspaceRepo = new WorkspaceRepository(db);
      const workspace2 = await workspaceRepo.insert('/test/other', 'other');

      await repo.insert(workspaceId, { name: 'One' });
      await repo.insert(workspace2.id, { name: 'Two' });

      expect(await repo.countByWorkspace(workspaceId)).toBe(1);
      expect(await repo.countByWorkspace(workspace2.id)).toBe(1);
    });
  });

  describe('JSON serialization of interviewQuotes', () => {
    it('serializes and deserializes complex quotes', async () => {
      const quotes = [
        'Quote with "nested" quotes',
        'Quote with special chars: <>&',
        'Multi\nline\nquote',
      ];
      const profile = await repo.insert(workspaceId, {
        name: 'Quoter',
        interviewQuotes: quotes,
      });

      const found = await repo.findById(profile.id);
      expect(found!.interviewQuotes).toEqual(quotes);
    });
  });
});
