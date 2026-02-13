/**
 * Pending agent approval resolution mechanism.
 *
 * When the agent loop encounters a write tool, it blocks on a Promise
 * that resolves when the user approves or rejects the action. This module
 * provides the bridge between the agent loop (which registers pending
 * approvals) and the IPC handlers (which resolve them when the user decides).
 *
 * Used by agent.ipc.ts (registers) and chat.ipc.ts (resolves via existing
 * CHAT_ACTION_APPROVE/REJECT channels that Agent B's frontend already calls).
 */

const pendingApprovals = new Map<string, { resolve: (approved: boolean) => void }>();

/**
 * Register a pending approval and return a Promise that resolves
 * when the user approves (true) or rejects (false).
 */
export function registerPendingApproval(approvalId: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    pendingApprovals.set(approvalId, { resolve });
  });
}

/**
 * Resolve a pending agent approval. Returns true if this was an agent
 * approval (and was resolved), false if the ID was not found (meaning
 * it's a Phase 3c approval that should go through the normal flow).
 */
export function resolveAgentApproval(approvalId: string, approved: boolean): boolean {
  const pending = pendingApprovals.get(approvalId);
  if (pending) {
    pending.resolve(approved);
    pendingApprovals.delete(approvalId);
    return true;
  }
  return false;
}

/**
 * Check if an ID corresponds to a pending agent approval.
 */
export function hasPendingAgentApproval(approvalId: string): boolean {
  return pendingApprovals.has(approvalId);
}
