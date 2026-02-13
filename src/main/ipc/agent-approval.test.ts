import { describe, it, expect } from 'vitest';
import {
  registerPendingApproval,
  resolveAgentApproval,
  hasPendingAgentApproval,
} from './agent-approval';

describe('agent-approval', () => {
  it('registers and resolves an approval with true', async () => {
    const promise = registerPendingApproval('approval-1');
    expect(hasPendingAgentApproval('approval-1')).toBe(true);

    const resolved = resolveAgentApproval('approval-1', true);
    expect(resolved).toBe(true);
    expect(hasPendingAgentApproval('approval-1')).toBe(false);

    const result = await promise;
    expect(result).toBe(true);
  });

  it('registers and resolves an approval with false (rejected)', async () => {
    const promise = registerPendingApproval('approval-2');

    const resolved = resolveAgentApproval('approval-2', false);
    expect(resolved).toBe(true);

    const result = await promise;
    expect(result).toBe(false);
  });

  it('returns false when resolving unknown ID', () => {
    const resolved = resolveAgentApproval('unknown-id', true);
    expect(resolved).toBe(false);
  });

  it('returns false for hasPendingAgentApproval with unknown ID', () => {
    expect(hasPendingAgentApproval('unknown-id')).toBe(false);
  });

  it('handles multiple concurrent approvals independently', async () => {
    const promise1 = registerPendingApproval('multi-1');
    const promise2 = registerPendingApproval('multi-2');

    expect(hasPendingAgentApproval('multi-1')).toBe(true);
    expect(hasPendingAgentApproval('multi-2')).toBe(true);

    resolveAgentApproval('multi-2', false);
    resolveAgentApproval('multi-1', true);

    expect(await promise1).toBe(true);
    expect(await promise2).toBe(false);
  });
});
