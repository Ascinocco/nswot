import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../test/helpers/test-db';
import { ChatActionRepository } from './chat-action.repository';
import { WorkspaceRepository } from './workspace.repository';
import { AnalysisRepository } from './analysis.repository';
import { ChatRepository } from './chat.repository';
import type Database from 'better-sqlite3';

describe('ChatActionRepository', () => {
  let db: Database.Database;
  let repo: ChatActionRepository;
  let analysisId: string;
  let chatMessageId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    repo = new ChatActionRepository(db);
    const workspaceRepo = new WorkspaceRepository(db);
    const analysisRepo = new AnalysisRepository(db);
    const chatRepo = new ChatRepository(db);
    const workspace = await workspaceRepo.insert('/test/workspace', 'test-workspace');
    const analysis = await analysisRepo.insert({
      workspaceId: workspace.id,
      role: 'staff_engineer',
      modelId: 'test-model',
      config: { profileIds: [], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [], codebaseRepos: [] },
    });
    analysisId = analysis.id;
    const chatMsg = await chatRepo.insert(analysisId, 'assistant', 'I will create a Jira issue for you.');
    chatMessageId = chatMsg.id;
  });

  describe('insert', () => {
    it('inserts an action and returns it with correct fields', async () => {
      const action = await repo.insert(analysisId, 'create_jira_issue', {
        project: 'PROJ',
        issueType: 'Epic',
        summary: 'Test Epic',
        description: 'A test epic',
      });

      expect(action.id).toBeDefined();
      expect(action.analysisId).toBe(analysisId);
      expect(action.chatMessageId).toBeNull();
      expect(action.toolName).toBe('create_jira_issue');
      expect(action.toolInput).toEqual({
        project: 'PROJ',
        issueType: 'Epic',
        summary: 'Test Epic',
        description: 'A test epic',
      });
      expect(action.status).toBe('pending');
      expect(action.result).toBeNull();
      expect(action.createdAt).toBeDefined();
      expect(action.executedAt).toBeNull();
    });

    it('inserts with optional chatMessageId', async () => {
      const action = await repo.insert(
        analysisId,
        'create_jira_issue',
        { project: 'PROJ', issueType: 'Task', summary: 'Test', description: 'Test' },
        chatMessageId,
      );

      expect(action.chatMessageId).toBe(chatMessageId);
    });
  });

  describe('findById', () => {
    it('returns action by id', async () => {
      const inserted = await repo.insert(analysisId, 'create_github_issue', {
        repo: 'owner/repo',
        title: 'Bug',
        body: 'Details',
      });

      const found = await repo.findById(inserted.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(inserted.id);
      expect(found!.toolName).toBe('create_github_issue');
      expect(found!.toolInput).toEqual({
        repo: 'owner/repo',
        title: 'Bug',
        body: 'Details',
      });
    });

    it('returns null for non-existent id', async () => {
      const found = await repo.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findByAnalysis', () => {
    it('returns actions ordered by created_at', async () => {
      const a1 = await repo.insert(analysisId, 'create_jira_issue', {
        project: 'PROJ',
        issueType: 'Epic',
        summary: 'First',
        description: 'First',
      });
      // Force distinct timestamps
      db.prepare('UPDATE chat_actions SET created_at = ? WHERE id = ?').run(
        '2024-01-01T00:00:00.000Z',
        a1.id,
      );
      await repo.insert(analysisId, 'add_jira_comment', {
        issueKey: 'PROJ-123',
        comment: 'Second',
      });

      const actions = await repo.findByAnalysis(analysisId);
      expect(actions).toHaveLength(2);
      expect(actions[0]!.toolName).toBe('create_jira_issue');
      expect(actions[1]!.toolName).toBe('add_jira_comment');
    });

    it('returns empty array for analysis with no actions', async () => {
      const actions = await repo.findByAnalysis(analysisId);
      expect(actions).toEqual([]);
    });
  });

  describe('updateStatus', () => {
    it('updates status without result', async () => {
      const action = await repo.insert(analysisId, 'create_jira_issue', {
        project: 'PROJ',
        issueType: 'Task',
        summary: 'Test',
        description: 'Test',
      });

      await repo.updateStatus(action.id, 'approved');

      const found = await repo.findById(action.id);
      expect(found!.status).toBe('approved');
      expect(found!.result).toBeNull();
      expect(found!.executedAt).toBeNull();
    });

    it('updates status with result and sets executedAt on completed', async () => {
      const action = await repo.insert(analysisId, 'create_jira_issue', {
        project: 'PROJ',
        issueType: 'Epic',
        summary: 'Test',
        description: 'Test',
      });

      const result = { success: true, id: 'PROJ-456', url: 'https://jira.example.com/PROJ-456' };
      await repo.updateStatus(action.id, 'completed', result);

      const found = await repo.findById(action.id);
      expect(found!.status).toBe('completed');
      expect(found!.result).toEqual(result);
      expect(found!.executedAt).toBeDefined();
    });

    it('sets executedAt on failed status', async () => {
      const action = await repo.insert(analysisId, 'create_github_issue', {
        repo: 'owner/repo',
        title: 'Test',
        body: 'Test',
      });

      const result = { success: false, error: 'MCP server not configured' };
      await repo.updateStatus(action.id, 'failed', result);

      const found = await repo.findById(action.id);
      expect(found!.status).toBe('failed');
      expect(found!.result).toEqual(result);
      expect(found!.executedAt).toBeDefined();
    });

    it('updates to rejected status', async () => {
      const action = await repo.insert(analysisId, 'create_confluence_page', {
        space: 'ENG',
        title: 'Test',
        content: '# Hello',
      });

      await repo.updateStatus(action.id, 'rejected');

      const found = await repo.findById(action.id);
      expect(found!.status).toBe('rejected');
      expect(found!.executedAt).toBeNull();
    });
  });

  describe('updateToolInput', () => {
    it('updates the tool input JSON', async () => {
      const action = await repo.insert(analysisId, 'create_jira_issue', {
        project: 'PROJ',
        issueType: 'Task',
        summary: 'Original',
        description: 'Original desc',
      });

      await repo.updateToolInput(action.id, {
        project: 'PROJ',
        issueType: 'Task',
        summary: 'Edited',
        description: 'Edited desc',
      });

      const found = await repo.findById(action.id);
      expect(found!.toolInput).toEqual({
        project: 'PROJ',
        issueType: 'Task',
        summary: 'Edited',
        description: 'Edited desc',
      });
    });
  });

  describe('deleteByAnalysis', () => {
    it('deletes all actions for an analysis', async () => {
      await repo.insert(analysisId, 'create_jira_issue', {
        project: 'PROJ',
        issueType: 'Task',
        summary: 'Test 1',
        description: 'Desc',
      });
      await repo.insert(analysisId, 'add_jira_comment', {
        issueKey: 'PROJ-123',
        comment: 'Test 2',
      });

      await repo.deleteByAnalysis(analysisId);
      const actions = await repo.findByAnalysis(analysisId);
      expect(actions).toEqual([]);
    });
  });
});
