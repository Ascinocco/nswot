import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApprovalMemoryService } from './approval-memory.service';
import type { ApprovalMemoryRepository } from '../repositories/approval-memory.repository';

function makeMockRepo(): ApprovalMemoryRepository {
  return {
    findByConversation: vi.fn().mockResolvedValue([]),
    isApproved: vi.fn().mockResolvedValue(false),
    set: vi.fn().mockResolvedValue(undefined),
    deleteByConversation: vi.fn().mockResolvedValue(undefined),
  } as unknown as ApprovalMemoryRepository;
}

describe('ApprovalMemoryService', () => {
  let service: ApprovalMemoryService;
  let repo: ApprovalMemoryRepository;

  beforeEach(() => {
    repo = makeMockRepo();
    service = new ApprovalMemoryService(repo);
  });

  describe('isToolApproved', () => {
    it('returns false when tool is not in memory', async () => {
      const result = await service.isToolApproved('conv-1', 'write_file');
      expect(result).toBe(false);
      expect(repo.isApproved).toHaveBeenCalledWith('conv-1', 'write_file');
    });

    it('returns true when tool is approved in memory', async () => {
      vi.mocked(repo.isApproved).mockResolvedValue(true);
      const result = await service.isToolApproved('conv-1', 'create_jira_issue');
      expect(result).toBe(true);
    });
  });

  describe('remember', () => {
    it('stores an approval decision', async () => {
      await service.remember('conv-1', 'write_file', true);
      expect(repo.set).toHaveBeenCalledWith('conv-1', 'write_file', true);
    });

    it('stores a rejection decision', async () => {
      await service.remember('conv-1', 'create_jira_issue', false);
      expect(repo.set).toHaveBeenCalledWith('conv-1', 'create_jira_issue', false);
    });
  });

  describe('list', () => {
    it('returns all entries for a conversation', async () => {
      const mockEntries = [
        { conversationId: 'conv-1', toolName: 'write_file', allowed: true },
        { conversationId: 'conv-1', toolName: 'create_jira_issue', allowed: true },
      ];
      vi.mocked(repo.findByConversation).mockResolvedValue(mockEntries);

      const result = await service.list('conv-1');
      expect(result).toHaveLength(2);
      expect(result[0]!.toolName).toBe('write_file');
      expect(result[1]!.toolName).toBe('create_jira_issue');
    });

    it('returns empty array when no entries', async () => {
      const result = await service.list('conv-1');
      expect(result).toHaveLength(0);
    });
  });
});
