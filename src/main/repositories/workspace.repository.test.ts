import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../../test/helpers/test-db';
import { WorkspaceRepository } from './workspace.repository';

describe('WorkspaceRepository', () => {
  let db: Database.Database;
  let repo: WorkspaceRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new WorkspaceRepository(db);
  });

  it('inserts and finds by id', async () => {
    const workspace = await repo.insert('/home/user/project', 'project');
    const found = await repo.findById(workspace.id);
    expect(found).not.toBeNull();
    expect(found!.path).toBe('/home/user/project');
    expect(found!.name).toBe('project');
  });

  it('finds by path', async () => {
    await repo.insert('/home/user/project', 'project');
    const found = await repo.findByPath('/home/user/project');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('project');
  });

  it('returns null for nonexistent id', async () => {
    const found = await repo.findById('nonexistent');
    expect(found).toBeNull();
  });

  it('returns null for nonexistent path', async () => {
    const found = await repo.findByPath('/nonexistent');
    expect(found).toBeNull();
  });

  it('updates last opened timestamp', async () => {
    const workspace = await repo.insert('/home/user/project', 'project');
    const original = workspace.lastOpenedAt;

    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 10));
    await repo.updateLastOpened(workspace.id);

    const updated = await repo.findById(workspace.id);
    expect(updated!.lastOpenedAt).not.toBe(original);
  });

  it('deletes a workspace', async () => {
    const workspace = await repo.insert('/home/user/project', 'project');
    await repo.delete(workspace.id);
    const found = await repo.findById(workspace.id);
    expect(found).toBeNull();
  });

  it('enforces unique path constraint', async () => {
    await repo.insert('/home/user/project', 'project');
    await expect(repo.insert('/home/user/project', 'project2')).rejects.toThrow();
  });
});
