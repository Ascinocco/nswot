export interface ActionExecutorOptions {
  model: string;
  maxTurns: number;
  timeoutMs: number;
  /** Override MCP server name prefixes for tool patterns. Defaults to common naming conventions. */
  mcpJiraPrefix: string;
  mcpConfluencePrefix: string;
  mcpGithubPrefix: string;
}

export const DEFAULT_ACTION_OPTIONS: ActionExecutorOptions = {
  model: 'sonnet',
  maxTurns: 15,
  timeoutMs: 120_000, // 2 minutes (was 10 minutes — excessive for single-item creation)
  mcpJiraPrefix: 'mcp__mcp-atlassian__jira',
  mcpConfluencePrefix: 'mcp__mcp-atlassian__confluence',
  mcpGithubPrefix: 'mcp__github',
};
