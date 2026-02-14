import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../test/helpers/test-db';
import { ConversationRepository } from './conversation.repository';
import { WorkspaceRepository } from './workspace.repository';
import { AnalysisRepository } from './analysis.repository';
import { ChatRepository } from './chat.repository';
import type Database from 'better-sqlite3';

describe('ConversationRepository', () => {
  let db: Database.Database;
  let repo: ConversationRepository;
  let workspaceId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    repo = new ConversationRepository(db);
    const workspaceRepo = new WorkspaceRepository(db);
    const workspace = await workspaceRepo.insert('/test/workspace', 'test-ws');
    workspaceId = workspace.id;
  });

  describe('insert and findById', () => {
    it('inserts a conversation and retrieves it by ID', async () => {
      const conv = await repo.insert(workspaceId, 'Test Conversation');

      expect(conv.id).toBeDefined();
      expect(conv.workspaceId).toBe(workspaceId);
      expect(conv.title).toBe('Test Conversation');
      expect(conv.createdAt).toBeDefined();
      expect(conv.updatedAt).toBeDefined();

      const found = await repo.findById(conv.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(conv.id);
      expect(found!.title).toBe('Test Conversation');
    });

    it('defaults title to null when not provided', async () => {
      const conv = await repo.insert(workspaceId);
      expect(conv.title).toBeNull();
    });

    it('returns null for non-existent ID', async () => {
      const found = await repo.findById('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('findByWorkspace', () => {
    it('returns conversations ordered by updated_at DESC', async () => {
      const c1 = await repo.insert(workspaceId, 'First');
      const c2 = await repo.insert(workspaceId, 'Second');

      // Make c1 more recent
      db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(
        '2099-01-01T00:00:00.000Z',
        c1.id,
      );

      const convs = await repo.findByWorkspace(workspaceId);
      expect(convs).toHaveLength(2);
      expect(convs[0]!.title).toBe('First');
      expect(convs[1]!.title).toBe('Second');
    });

    it('returns empty array for workspace with no conversations', async () => {
      const convs = await repo.findByWorkspace(workspaceId);
      expect(convs).toEqual([]);
    });
  });

  describe('updateTitle', () => {
    it('updates the title and updated_at', async () => {
      const conv = await repo.insert(workspaceId, 'Original');
      await repo.updateTitle(conv.id, 'Updated');

      const found = await repo.findById(conv.id);
      expect(found!.title).toBe('Updated');
      expect(found!.updatedAt >= conv.updatedAt).toBe(true);
    });
  });

  describe('updateTimestamp', () => {
    it('updates updated_at without changing title', async () => {
      const conv = await repo.insert(workspaceId, 'Keep Title');
      const originalUpdated = conv.updatedAt;

      // Force a different timestamp
      db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(
        '2020-01-01T00:00:00.000Z',
        conv.id,
      );

      await repo.updateTimestamp(conv.id);

      const found = await repo.findById(conv.id);
      expect(found!.title).toBe('Keep Title');
      expect(found!.updatedAt > '2020-01-01T00:00:00.000Z').toBe(true);
    });
  });

  describe('delete', () => {
    it('deletes a conversation', async () => {
      const conv = await repo.insert(workspaceId, 'To Delete');
      await repo.delete(conv.id);

      const found = await repo.findById(conv.id);
      expect(found).toBeNull();
    });
  });

  describe('deleteWithCascade', () => {
    it('deletes conversation and cleans up related chat data', async () => {
      const conv = await repo.insert(workspaceId, 'Cascade Target');
      const analysisRepo = new AnalysisRepository(db);
      const chatRepo = new ChatRepository(db);

      // Create an analysis linked to the conversation
      const analysis = await analysisRepo.insert({
        workspaceId,
        role: 'staff_engineer',
        modelId: 'test-model',
        config: { profileIds: [], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [], codebaseRepos: [] },
      });
      db.prepare('UPDATE analyses SET conversation_id = ? WHERE id = ?').run(conv.id, analysis.id);

      // Add chat messages and actions
      await chatRepo.insert(analysis.id, 'user', 'Hello');
      await chatRepo.insert(analysis.id, 'assistant', 'Hi');
      db.prepare(
        'INSERT INTO chat_actions (id, analysis_id, chat_message_id, tool_name, tool_input, status, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)',
      ).run('act-1', analysis.id, 'write_file', '{}', 'pending', new Date().toISOString());

      // Verify data exists
      expect(await chatRepo.findByAnalysis(analysis.id)).toHaveLength(2);
      expect(
        (db.prepare('SELECT COUNT(*) as c FROM chat_actions WHERE analysis_id = ?').get(analysis.id) as { c: number }).c,
      ).toBe(1);

      // Cascade delete
      repo.deleteWithCascade(conv.id);

      // Conversation deleted
      expect(await repo.findById(conv.id)).toBeNull();

      // Chat messages and actions deleted
      expect(await chatRepo.findByAnalysis(analysis.id)).toHaveLength(0);
      expect(
        (db.prepare('SELECT COUNT(*) as c FROM chat_actions WHERE analysis_id = ?').get(analysis.id) as { c: number }).c,
      ).toBe(0);

      // Analysis still exists but conversation_id is cleared
      const updatedAnalysis = await analysisRepo.findById(analysis.id);
      expect(updatedAnalysis).not.toBeNull();
      expect(updatedAnalysis!.conversationId).toBeNull();
    });

    it('cascades approval_memory via FK constraint', async () => {
      const conv = await repo.insert(workspaceId, 'Approval Test');

      // Insert approval memory entry
      db.prepare(
        'INSERT INTO approval_memory (conversation_id, tool_name, allowed) VALUES (?, ?, ?)',
      ).run(conv.id, 'write_file', 1);

      expect(
        (db.prepare('SELECT COUNT(*) as c FROM approval_memory WHERE conversation_id = ?').get(conv.id) as { c: number }).c,
      ).toBe(1);

      repo.deleteWithCascade(conv.id);

      expect(
        (db.prepare('SELECT COUNT(*) as c FROM approval_memory WHERE conversation_id = ?').get(conv.id) as { c: number }).c,
      ).toBe(0);
    });
  });
});
