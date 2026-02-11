export interface TokenBudget {
  profiles: number;
  jiraData: number;
  confluenceData: number;
  githubData: number;
  codebaseData: number;
  buffer: number;
  outputReserve: number;
  total: number;
}

export type ConnectedSource = 'jira' | 'confluence' | 'github' | 'codebase';

const SYSTEM_PROMPT_OVERHEAD = 500;
const SCHEMA_OVERHEAD = 500;
const CHARS_PER_TOKEN = 3; // conservative estimate for mixed markdown/HTML content

const PROFILES_SHARE = 0.3;
const BUFFER_SHARE = 0.1;
const SOURCES_SHARE = 0.6; // 60% split among connected sources

export function calculateTokenBudget(
  modelContextWindow: number,
  connectedSources: ConnectedSource[] = [],
): TokenBudget {
  const outputReserve = Math.min(16384, Math.floor(modelContextWindow * 0.15));
  const available =
    modelContextWindow - outputReserve - SCHEMA_OVERHEAD - SYSTEM_PROMPT_OVERHEAD;

  const profileTokens = Math.floor(available * PROFILES_SHARE);
  const bufferTokens = Math.floor(available * BUFFER_SHARE);
  const sourcesTokens = Math.floor(available * SOURCES_SHARE);

  // Distribute source tokens proportionally among connected sources
  const sourceCount = Math.max(connectedSources.length, 1);
  const perSourceTokens = Math.floor(sourcesTokens / sourceCount);

  return {
    profiles: profileTokens,
    jiraData: connectedSources.includes('jira') ? perSourceTokens : 0,
    confluenceData: connectedSources.includes('confluence') ? perSourceTokens : 0,
    githubData: connectedSources.includes('github') ? perSourceTokens : 0,
    codebaseData: connectedSources.includes('codebase') ? perSourceTokens : 0,
    buffer: bufferTokens,
    outputReserve,
    total: modelContextWindow,
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function trimToTokenBudget(text: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n[...truncated]';
}
