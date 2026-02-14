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

export interface ApprovalResult {
  approved: boolean;
  remember: boolean;
}

/** Default timeout for pending approvals (5 minutes). */
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

interface PendingApproval {
  resolve: (result: ApprovalResult) => void;
  timer: ReturnType<typeof setTimeout>;
  metadata: { conversationId: string; toolName: string };
}

const pendingApprovals = new Map<string, PendingApproval>();

/**
 * Register a pending approval and return a Promise that resolves
 * when the user approves (true) or rejects (false).
 * Automatically rejects after the timeout period.
 */
export function registerPendingApproval(
  approvalId: string,
  metadata: { conversationId: string; toolName: string },
  timeoutMs: number = APPROVAL_TIMEOUT_MS,
): Promise<ApprovalResult> {
  return new Promise<ApprovalResult>((resolve) => {
    const timer = setTimeout(() => {
      // Auto-reject on timeout
      pendingApprovals.delete(approvalId);
      resolve({ approved: false, remember: false });
    }, timeoutMs);

    pendingApprovals.set(approvalId, { resolve, timer, metadata });
  });
}

/**
 * Resolve a pending agent approval. Returns the metadata if this was an agent
 * approval (and was resolved), null if the ID was not found (meaning
 * it's a Phase 3c approval that should go through the normal flow).
 */
export function resolveAgentApproval(
  approvalId: string,
  approved: boolean,
  remember: boolean = false,
): { conversationId: string; toolName: string } | null {
  const pending = pendingApprovals.get(approvalId);
  if (pending) {
    clearTimeout(pending.timer);
    pending.resolve({ approved, remember });
    const metadata = pending.metadata;
    pendingApprovals.delete(approvalId);
    return metadata;
  }
  return null;
}

/**
 * Check if an ID corresponds to a pending agent approval.
 */
export function hasPendingAgentApproval(approvalId: string): boolean {
  return pendingApprovals.has(approvalId);
}
