import type { CodebaseProviderInterface } from './codebase-provider.interface';
import { ClaudeCliCodebaseProvider } from './codebase.provider';
import { OpenCodeProvider } from './opencode.provider';

export type CodebaseProviderType = 'claude_cli' | 'opencode';

export function createCodebaseProvider(
  type: CodebaseProviderType = 'claude_cli',
): CodebaseProviderInterface {
  switch (type) {
    case 'claude_cli':
      return new ClaudeCliCodebaseProvider();
    case 'opencode':
      return new OpenCodeProvider();
    default:
      throw new Error(`Unknown codebase provider type: ${type as string}`);
  }
}
