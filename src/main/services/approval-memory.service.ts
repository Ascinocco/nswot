import type { ApprovalMemoryRepository, ApprovalMemoryEntry } from '../repositories/approval-memory.repository';

/**
 * Business logic for per-conversation tool approval memory.
 *
 * When a user approves a write tool with "Yes + Remember", the decision
 * is stored. Subsequent uses of that tool in the same conversation are
 * auto-approved without prompting the user again.
 */
export class ApprovalMemoryService {
  constructor(private readonly repo: ApprovalMemoryRepository) {}

  /** Check if a tool is auto-approved for this conversation. */
  async isToolApproved(conversationId: string, toolName: string): Promise<boolean> {
    return this.repo.isApproved(conversationId, toolName);
  }

  /** Store an approval decision (approve or reject) for a tool in this conversation. */
  async remember(conversationId: string, toolName: string, allowed: boolean): Promise<void> {
    await this.repo.set(conversationId, toolName, allowed);
  }

  /** List all approval memory entries for a conversation. */
  async list(conversationId: string): Promise<ApprovalMemoryEntry[]> {
    return this.repo.findByConversation(conversationId);
  }
}
