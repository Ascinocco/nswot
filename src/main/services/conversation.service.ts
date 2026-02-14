import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { Conversation, Analysis } from '../domain/types';
import type { ConversationRepository } from '../repositories/conversation.repository';
import type { AnalysisRepository } from '../repositories/analysis.repository';
import type { WorkspaceService } from './workspace.service';

/** Role display names for auto-generated conversation titles. */
const ROLE_LABELS: Record<string, string> = {
  staff_engineer: 'Staff Engineer',
  senior_em: 'Senior Engineering Manager',
  vp_engineering: 'VP Engineering',
};

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Generate an auto-title for a conversation based on the analysis role and date.
 * E.g., "Staff Engineer Analysis — Feb 12, 2026"
 */
export function generateConversationTitle(role: Analysis['role'], date: string): string {
  const roleLabel = ROLE_LABELS[role] ?? role;
  return `${roleLabel} Analysis — ${formatDate(date)}`;
}

export class ConversationService {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly analysisRepo?: AnalysisRepository,
  ) {}

  async list(): Promise<Result<Conversation[], DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      const conversations = await this.conversationRepo.findByWorkspace(workspaceId);
      return ok(conversations);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to list conversations', cause));
    }
  }

  async get(id: string): Promise<Result<Conversation, DomainError>> {
    try {
      const conversation = await this.conversationRepo.findById(id);
      if (!conversation) {
        return err(new DomainError(ERROR_CODES.NOT_FOUND, `Conversation "${id}" not found`));
      }
      return ok(conversation);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to get conversation', cause));
    }
  }

  async create(role: Analysis['role']): Promise<Result<Conversation, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      const now = new Date().toISOString();
      const title = generateConversationTitle(role, now);
      const conversation = await this.conversationRepo.insert(workspaceId, title);
      return ok(conversation);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to create conversation', cause));
    }
  }

  async updateTitle(id: string, title: string): Promise<Result<void, DomainError>> {
    try {
      const conversation = await this.conversationRepo.findById(id);
      if (!conversation) {
        return err(new DomainError(ERROR_CODES.NOT_FOUND, `Conversation "${id}" not found`));
      }
      await this.conversationRepo.updateTitle(id, title);
      return ok(undefined);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to update conversation title', cause));
    }
  }

  async delete(id: string): Promise<Result<void, DomainError>> {
    try {
      const conversation = await this.conversationRepo.findById(id);
      if (!conversation) {
        return err(new DomainError(ERROR_CODES.NOT_FOUND, `Conversation "${id}" not found`));
      }
      // Transactional cascade: deletes chat messages, chat actions, clears analysis links,
      // and removes conversation + approval_memory in one atomic operation.
      this.conversationRepo.deleteWithCascade(id);
      return ok(undefined);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to delete conversation', cause));
    }
  }

  async touch(id: string): Promise<void> {
    try {
      await this.conversationRepo.updateTimestamp(id);
    } catch {
      // Non-critical — failing to touch the timestamp shouldn't break the caller
    }
  }
}
