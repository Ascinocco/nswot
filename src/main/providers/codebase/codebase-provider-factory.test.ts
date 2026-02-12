import { describe, it, expect } from 'vitest';
import { createCodebaseProvider } from './codebase-provider-factory';
import { ClaudeCliCodebaseProvider } from './codebase.provider';
import { OpenCodeProvider } from './opencode.provider';

describe('createCodebaseProvider', () => {
  it('returns ClaudeCliCodebaseProvider for claude_cli', () => {
    const provider = createCodebaseProvider('claude_cli');
    expect(provider).toBeInstanceOf(ClaudeCliCodebaseProvider);
    expect(provider.name).toBe('claude_cli');
  });

  it('returns OpenCodeProvider for opencode', () => {
    const provider = createCodebaseProvider('opencode');
    expect(provider).toBeInstanceOf(OpenCodeProvider);
    expect(provider.name).toBe('opencode');
  });

  it('defaults to claude_cli when no type given', () => {
    const provider = createCodebaseProvider();
    expect(provider).toBeInstanceOf(ClaudeCliCodebaseProvider);
  });

  it('throws for unknown provider type', () => {
    expect(() => createCodebaseProvider('unknown' as 'claude_cli')).toThrow(
      'Unknown codebase provider type',
    );
  });
});
