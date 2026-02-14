import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../test/helpers/test-db';
import { ApprovalMemoryRepository } from './approval-memory.repository';
import { ConversationRepository } from './conversation.repository';
import { WorkspaceRepository } from './workspace.repository';
import type Database from 'better-sqlite3';

describe('ApprovalMemoryRepository', () => {
  let db: Database.Database;
  let repo: ApprovalMemoryRepository;
  let conversationId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    repo = new ApprovalMemoryRepository(db);
    const workspaceRepo = new WorkspaceRepository(db);
    const conversationRepo = new ConversationRepository(db);
    const workspace = await workspaceRepo.insert('/test/workspace', 'test-ws');
    const conv = await conversationRepo.insert(workspace.id, 'Test Conv');
    conversationId = conv.id;
  });

  describe('set and isApproved', () => {
    it('sets a tool as approved and queries it', async () => {
      await repo.set(conversationId, 'write_file', true);

      const approved = await repo.isApproved(conversationId, 'write_file');
      expect(approved).toBe(true);
    });

    it('sets a tool as rejected and queries it', async () => {
      await repo.set(conversationId, 'create_jira_issue', false);

      const approved = await repo.isApproved(conversationId, 'create_jira_issue');
      expect(approved).toBe(false);
    });

    it('returns false for a tool that was never set', async () => {
      const approved = await repo.isApproved(conversationId, 'unknown_tool');
      expect(approved).toBe(false);
    });

    it('upserts on conflict — updates existing entry', async () => {
      await repo.set(conversationId, 'write_file', true);
      expect(await repo.isApproved(conversationId, 'write_file')).toBe(true);

      await repo.set(conversationId, 'write_file', false);
      expect(await repo.isApproved(conversationId, 'write_file')).toBe(false);
    });
  });

  describe('findByConversation', () => {
    it('returns all entries for a conversation', async () => {
      await repo.set(conversationId, 'write_file', true);
      await repo.set(conversationId, 'create_jira_issue', false);
      await repo.set(conversationId, 'create_github_issue', true);

      const entries = await repo.findByConversation(conversationId);
      expect(entries).toHaveLength(3);

      const names = entries.map((e) => e.toolName).sort();
      expect(names).toEqual(['create_github_issue', 'create_jira_issue', 'write_file']);

      const writeEntry = entries.find((e) => e.toolName === 'write_file');
      expect(writeEntry!.allowed).toBe(true);
      expect(writeEntry!.conversationId).toBe(conversationId);

      const jiraEntry = entries.find((e) => e.toolName === 'create_jira_issue');
      expect(jiraEntry!.allowed).toBe(false);
    });

    it('returns empty array for conversation with no entries', async () => {
      const entries = await repo.findByConversation(conversationId);
      expect(entries).toEqual([]);
    });
  });

  describe('deleteByConversation', () => {
    it('deletes all entries for a conversation', async () => {
      await repo.set(conversationId, 'write_file', true);
      await repo.set(conversationId, 'create_jira_issue', true);

      await repo.deleteByConversation(conversationId);

      const entries = await repo.findByConversation(conversationId);
      expect(entries).toEqual([]);
    });
  });

  describe('FK cascade on conversation delete', () => {
    it('entries are deleted when parent conversation is deleted', async () => {
      await repo.set(conversationId, 'write_file', true);
      await repo.set(conversationId, 'create_jira_issue', false);

      // Delete the conversation directly
      db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId);

      const entries = await repo.findByConversation(conversationId);
      expect(entries).toEqual([]);
    });
  });
});
