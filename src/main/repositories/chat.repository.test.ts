import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../test/helpers/test-db';
import { ChatRepository } from './chat.repository';
import { WorkspaceRepository } from './workspace.repository';
import { AnalysisRepository } from './analysis.repository';
import type Database from 'better-sqlite3';

describe('ChatRepository', () => {
  let db: Database.Database;
  let repo: ChatRepository;
  let analysisId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    repo = new ChatRepository(db);
    const workspaceRepo = new WorkspaceRepository(db);
    const analysisRepo = new AnalysisRepository(db);
    const workspace = await workspaceRepo.insert('/test/workspace', 'test-workspace');
    const analysis = await analysisRepo.insert({
      workspaceId: workspace.id,
      role: 'staff_engineer',
      modelId: 'test-model',
      config: { profileIds: [], jiraProjectKeys: [] },
    });
    analysisId = analysis.id;
  });

  describe('insert and findByAnalysis', () => {
    it('inserts a message and retrieves it', async () => {
      const msg = await repo.insert(analysisId, 'user', 'Hello');

      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello');
      expect(msg.analysisId).toBe(analysisId);
      expect(msg.id).toBeDefined();
      expect(msg.createdAt).toBeDefined();

      const messages = await repo.findByAnalysis(analysisId);
      expect(messages).toHaveLength(1);
      expect(messages[0]!.content).toBe('Hello');
    });

    it('returns messages ordered by created_at asc', async () => {
      const m1 = await repo.insert(analysisId, 'user', 'First');
      // Ensure distinct timestamps
      db.prepare('UPDATE chat_messages SET created_at = ? WHERE id = ?').run(
        '2024-01-01T00:00:00.000Z',
        m1.id,
      );
      await repo.insert(analysisId, 'assistant', 'Second');

      const messages = await repo.findByAnalysis(analysisId);
      expect(messages).toHaveLength(2);
      expect(messages[0]!.content).toBe('First');
      expect(messages[1]!.content).toBe('Second');
    });

    it('returns empty for analysis with no messages', async () => {
      const messages = await repo.findByAnalysis(analysisId);
      expect(messages).toEqual([]);
    });
  });

  describe('deleteByAnalysis', () => {
    it('deletes all messages for an analysis', async () => {
      await repo.insert(analysisId, 'user', 'Hello');
      await repo.insert(analysisId, 'assistant', 'Hi there');

      await repo.deleteByAnalysis(analysisId);
      const messages = await repo.findByAnalysis(analysisId);
      expect(messages).toEqual([]);
    });
  });

  describe('countByAnalysis', () => {
    it('counts messages for an analysis', async () => {
      await repo.insert(analysisId, 'user', 'Hello');
      await repo.insert(analysisId, 'assistant', 'Hi');
      await repo.insert(analysisId, 'user', 'How are you?');

      const count = await repo.countByAnalysis(analysisId);
      expect(count).toBe(3);
    });

    it('returns 0 for analysis with no messages', async () => {
      const count = await repo.countByAnalysis(analysisId);
      expect(count).toBe(0);
    });
  });
});
