export interface TokenBudget {
  profiles: number;
  jiraData: number;
  buffer: number;
  outputReserve: number;
  total: number;
}

const SYSTEM_PROMPT_OVERHEAD = 500;
const SCHEMA_OVERHEAD = 500;
const CHARS_PER_TOKEN = 4; // rough estimate

export function calculateTokenBudget(modelContextWindow: number): TokenBudget {
  const outputReserve = Math.min(4096, Math.floor(modelContextWindow * 0.1));
  const available =
    modelContextWindow - outputReserve - SCHEMA_OVERHEAD - SYSTEM_PROMPT_OVERHEAD;

  return {
    profiles: Math.floor(available * 0.4),
    jiraData: Math.floor(available * 0.5),
    buffer: Math.floor(available * 0.1),
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
