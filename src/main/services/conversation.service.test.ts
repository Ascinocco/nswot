import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationService, generateConversationTitle } from './conversation.service';
import type { ConversationRepository } from '../repositories/conversation.repository';
import type { WorkspaceService } from './workspace.service';
import type { Conversation } from '../domain/types';

function makeMockConversationRepo(): ConversationRepository {
  return {
    findByWorkspace: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    insert: vi.fn(async (workspaceId: string, title?: string | null) => ({
      id: 'conv-1',
      workspaceId,
      title: title ?? null,
      createdAt: '2026-02-12T00:00:00.000Z',
      updatedAt: '2026-02-12T00:00:00.000Z',
    })),
    updateTitle: vi.fn().mockResolvedValue(undefined),
    updateTimestamp: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    deleteWithCascade: vi.fn(),
  } as unknown as ConversationRepository;
}

function makeMockWorkspaceService(workspaceId: string | null = 'ws-1'): WorkspaceService {
  return {
    getCurrentId: vi.fn(() => workspaceId),
  } as unknown as WorkspaceService;
}

describe('ConversationService', () => {
  let service: ConversationService;
  let repo: ConversationRepository;
  let workspaceService: WorkspaceService;

  beforeEach(() => {
    repo = makeMockConversationRepo();
    workspaceService = makeMockWorkspaceService();
    service = new ConversationService(repo, workspaceService);
  });

  describe('list', () => {
    it('returns conversations for current workspace', async () => {
      const conversations: Conversation[] = [
        { id: 'c1', workspaceId: 'ws-1', title: 'Test', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ];
      (repo.findByWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(conversations);

      const result = await service.list();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.title).toBe('Test');
      }
    });

    it('returns error when no workspace open', async () => {
      service = new ConversationService(repo, makeMockWorkspaceService(null));

      const result = await service.list();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WORKSPACE_NOT_FOUND');
      }
    });
  });

  describe('get', () => {
    it('returns a conversation by ID', async () => {
      const conv: Conversation = { id: 'c1', workspaceId: 'ws-1', title: 'Found', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(conv);

      const result = await service.get('c1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.title).toBe('Found');
      }
    });

    it('returns error when not found', async () => {
      const result = await service.get('nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('create', () => {
    it('creates a conversation with auto-generated title', async () => {
      const result = await service.create('staff_engineer');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('conv-1');
      }
      // Verify the title passed to the repo contains the role
      const insertCall = (repo.insert as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(insertCall[0]).toBe('ws-1');
      expect(insertCall[1]).toContain('Staff Engineer Analysis');
    });

    it('returns error when no workspace open', async () => {
      service = new ConversationService(repo, makeMockWorkspaceService(null));

      const result = await service.create('staff_engineer');
      expect(result.ok).toBe(false);
    });
  });

  describe('updateTitle', () => {
    it('updates title for existing conversation', async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'c1', workspaceId: 'ws-1', title: 'Old', createdAt: '2026-01-01', updatedAt: '2026-01-01',
      });

      const result = await service.updateTitle('c1', 'New Title');
      expect(result.ok).toBe(true);
      expect(repo.updateTitle).toHaveBeenCalledWith('c1', 'New Title');
    });

    it('returns error for nonexistent conversation', async () => {
      const result = await service.updateTitle('nope', 'Title');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('delete', () => {
    it('deletes an existing conversation', async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'c1', workspaceId: 'ws-1', title: 'X', createdAt: '2026-01-01', updatedAt: '2026-01-01',
      });

      const result = await service.delete('c1');
      expect(result.ok).toBe(true);
      expect(repo.deleteWithCascade).toHaveBeenCalledWith('c1');
    });

    it('returns error for nonexistent conversation', async () => {
      const result = await service.delete('nope');
      expect(result.ok).toBe(false);
    });
  });

  describe('touch', () => {
    it('updates the conversation timestamp', async () => {
      await service.touch('c1');
      expect(repo.updateTimestamp).toHaveBeenCalledWith('c1');
    });
  });
});

describe('generateConversationTitle', () => {
  it('generates title for staff_engineer', () => {
    const title = generateConversationTitle('staff_engineer', '2026-02-12T00:00:00.000Z');
    expect(title).toContain('Staff Engineer Analysis');
    expect(title).toContain('2026');
  });

  it('generates title for senior_em', () => {
    const title = generateConversationTitle('senior_em', '2026-03-15T00:00:00.000Z');
    expect(title).toContain('Senior Engineering Manager Analysis');
  });

  it('generates title for vp_engineering', () => {
    const title = generateConversationTitle('vp_engineering', '2026-01-01T00:00:00.000Z');
    expect(title).toContain('VP Engineering Analysis');
  });
});
