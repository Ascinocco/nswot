import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  registerPendingApproval,
  resolveAgentApproval,
  hasPendingAgentApproval,
} from './agent-approval';

const metadata = { conversationId: 'conv-1', toolName: 'create_jira_issue' };

describe('agent-approval', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers and resolves an approval with true', async () => {
    const promise = registerPendingApproval('approval-1', metadata);
    expect(hasPendingAgentApproval('approval-1')).toBe(true);

    const resolved = resolveAgentApproval('approval-1', true);
    expect(resolved).toEqual(metadata);
    expect(hasPendingAgentApproval('approval-1')).toBe(false);

    const result = await promise;
    expect(result).toEqual({ approved: true, remember: false });
  });

  it('registers and resolves an approval with false (rejected)', async () => {
    const promise = registerPendingApproval('approval-2', metadata);

    const resolved = resolveAgentApproval('approval-2', false);
    expect(resolved).toEqual(metadata);

    const result = await promise;
    expect(result).toEqual({ approved: false, remember: false });
  });

  it('passes remember flag through', async () => {
    const promise = registerPendingApproval('approval-3', metadata);

    resolveAgentApproval('approval-3', true, true);

    const result = await promise;
    expect(result).toEqual({ approved: true, remember: true });
  });

  it('returns null when resolving unknown ID', () => {
    const resolved = resolveAgentApproval('unknown-id', true);
    expect(resolved).toBeNull();
  });

  it('returns false for hasPendingAgentApproval with unknown ID', () => {
    expect(hasPendingAgentApproval('unknown-id')).toBe(false);
  });

  it('handles multiple concurrent approvals independently', async () => {
    const meta1 = { conversationId: 'conv-1', toolName: 'tool-a' };
    const meta2 = { conversationId: 'conv-1', toolName: 'tool-b' };
    const promise1 = registerPendingApproval('multi-1', meta1);
    const promise2 = registerPendingApproval('multi-2', meta2);

    expect(hasPendingAgentApproval('multi-1')).toBe(true);
    expect(hasPendingAgentApproval('multi-2')).toBe(true);

    resolveAgentApproval('multi-2', false);
    resolveAgentApproval('multi-1', true);

    expect(await promise1).toEqual({ approved: true, remember: false });
    expect(await promise2).toEqual({ approved: false, remember: false });
  });

  it('auto-rejects on timeout', async () => {
    vi.useFakeTimers();

    const promise = registerPendingApproval('timeout-1', metadata, 1000);
    expect(hasPendingAgentApproval('timeout-1')).toBe(true);

    vi.advanceTimersByTime(1000);

    const result = await promise;
    expect(result).toEqual({ approved: false, remember: false });
    expect(hasPendingAgentApproval('timeout-1')).toBe(false);

    vi.useRealTimers();
  });
});
