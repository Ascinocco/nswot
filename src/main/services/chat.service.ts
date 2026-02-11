import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { ChatMessage, Analysis, SwotOutput, SummariesOutput } from '../domain/types';
import type { ChatRepository } from '../repositories/chat.repository';
import type { AnalysisRepository } from '../repositories/analysis.repository';
import type { SettingsService } from './settings.service';
import { estimateTokens, trimToTokenBudget } from '../analysis/token-budget';

const CHAT_TEMPERATURE = 0.3;
const CHAT_MAX_TOKENS = 2048;
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface ChatTokenBudget {
  systemPrompt: number;
  chatHistory: number;
  userMessage: number;
  outputReserve: number;
}

function calculateChatTokenBudget(contextWindow: number): ChatTokenBudget {
  const outputReserve = Math.min(CHAT_MAX_TOKENS, Math.floor(contextWindow * 0.05));
  const available = contextWindow - outputReserve;
  return {
    systemPrompt: Math.floor(available * 0.6),
    chatHistory: Math.floor(available * 0.3),
    userMessage: Math.floor(available * 0.05),
    outputReserve,
  };
}

export function buildChatSystemPrompt(
  analysis: Analysis,
): string {
  const role = analysis.role === 'staff_engineer' ? 'Staff Engineer' : 'Senior Engineering Manager';
  const swot = analysis.swotOutput;
  const summaries = analysis.summariesOutput;

  let prompt = `You are a follow-up analyst for an organizational SWOT analysis. You help the user explore the analysis results, understand evidence, and plan actions.

CONTEXT:
The user has completed a SWOT analysis as a ${role}. The full analysis results are provided below. All stakeholder names are anonymized.

RULES:
1. Ground every response in the analysis data provided. If the user asks about something not covered in the analysis, say so explicitly.
2. Do not invent information about the organization. Only reference data from the analysis.
3. When suggesting actions, tailor them to the ${role} role.
4. You may reason about implications of the data, but clearly distinguish between "the data shows X" and "this suggests Y".
5. Keep responses focused and actionable. Avoid generic advice.
6. You cannot create files, execute code, or access external data. You can only discuss the analysis.

ANALYSIS DATA:`;

  if (swot) {
    prompt += '\n\n' + formatSwotForChat(swot);
  }

  if (summaries) {
    prompt += `\n\n## Source Summaries\n\n### Stakeholder Interview Summary\n${summaries.profiles}\n\n### Jira Data Summary\n${summaries.jira}`;
  }

  return prompt;
}

function formatSwotForChat(swot: SwotOutput): string {
  const sections: string[] = ['## SWOT Results'];

  const quadrants: [string, typeof swot.strengths][] = [
    ['Strengths', swot.strengths],
    ['Weaknesses', swot.weaknesses],
    ['Opportunities', swot.opportunities],
    ['Threats', swot.threats],
  ];

  for (const [name, items] of quadrants) {
    sections.push(`\n### ${name}`);
    if (items.length === 0) {
      sections.push('(none identified)');
      continue;
    }
    for (const item of items) {
      const evidenceSummary = item.evidence
        .map((e) => `[${e.sourceId}]: "${e.quote}"`)
        .join('; ');
      sections.push(
        `- **${item.claim}** (Confidence: ${item.confidence})\n  Evidence: ${evidenceSummary}\n  Impact: ${item.impact}\n  Recommendation: ${item.recommendation}`,
      );
    }
  }

  return sections.join('\n');
}

export class ChatService {
  constructor(
    private readonly chatRepo: ChatRepository,
    private readonly analysisRepo: AnalysisRepository,
    private readonly settingsService: SettingsService,
  ) {}

  async getMessages(analysisId: string): Promise<Result<ChatMessage[], DomainError>> {
    try {
      const analysis = await this.analysisRepo.findById(analysisId);
      if (!analysis) {
        return err(new DomainError(ERROR_CODES.INTERNAL_ERROR, `Analysis "${analysisId}" not found`));
      }
      const messages = await this.chatRepo.findByAnalysis(analysisId);
      return ok(messages);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to get chat messages', cause));
    }
  }

  async sendMessage(
    analysisId: string,
    userContent: string,
    onChunk: (chunk: string) => void,
  ): Promise<Result<ChatMessage, DomainError>> {
    const analysis = await this.analysisRepo.findById(analysisId);
    if (!analysis) {
      return err(new DomainError(ERROR_CODES.INTERNAL_ERROR, `Analysis "${analysisId}" not found`));
    }
    if (analysis.status !== 'completed') {
      return err(
        new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Cannot chat with an incomplete analysis'),
      );
    }

    const apiKey = this.settingsService.getApiKey();
    if (!apiKey) {
      return err(new DomainError(ERROR_CODES.LLM_AUTH_FAILED, 'API key is not configured'));
    }

    try {
      // Store user message
      const userMessage = await this.chatRepo.insert(analysisId, 'user', userContent);

      // Build messages array
      const systemPrompt = buildChatSystemPrompt(analysis);
      const history = await this.chatRepo.findByAnalysis(analysisId);

      // Token budgeting: trim history if needed
      const contextWindow = 128_000; // Default; ideally fetched from model info
      const budget = calculateChatTokenBudget(contextWindow);

      let trimmedSystemPrompt = systemPrompt;
      if (estimateTokens(systemPrompt) > budget.systemPrompt) {
        trimmedSystemPrompt = trimToTokenBudget(systemPrompt, budget.systemPrompt);
      }

      const messages = buildChatMessages(trimmedSystemPrompt, history, budget.chatHistory);

      // Call OpenRouter
      const assistantContent = await this.streamCompletion(
        apiKey,
        analysis.modelId,
        messages,
        onChunk,
      );

      // Store assistant message
      const assistantMessage = await this.chatRepo.insert(
        analysisId,
        'assistant',
        assistantContent,
      );

      return ok(assistantMessage);
    } catch (cause) {
      if (cause instanceof DomainError) {
        return err(cause);
      }
      return err(new DomainError(ERROR_CODES.LLM_REQUEST_FAILED, 'Chat request failed', cause));
    }
  }

  async deleteMessages(analysisId: string): Promise<Result<void, DomainError>> {
    try {
      const analysis = await this.analysisRepo.findById(analysisId);
      if (!analysis) {
        return err(new DomainError(ERROR_CODES.INTERNAL_ERROR, `Analysis "${analysisId}" not found`));
      }
      await this.chatRepo.deleteByAnalysis(analysisId);
      return ok(undefined);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to delete chat messages', cause));
    }
  }

  private async streamCompletion(
    apiKey: string,
    modelId: string,
    messages: Array<{ role: string; content: string }>,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://nswot.app',
        'X-Title': 'nswot',
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: CHAT_TEMPERATURE,
        max_tokens: CHAT_MAX_TOKENS,
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) {
        throw new DomainError(ERROR_CODES.LLM_AUTH_FAILED, 'Invalid API key');
      }
      if (status === 429) {
        throw new DomainError(ERROR_CODES.LLM_RATE_LIMITED, 'Rate limited by OpenRouter');
      }
      throw new DomainError(
        ERROR_CODES.LLM_REQUEST_FAILED,
        `OpenRouter returned status ${status}`,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new DomainError(ERROR_CODES.LLM_REQUEST_FAILED, 'No response body');
    }

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullContent += content;
            onChunk(content);
          }
        } catch {
          // Skip malformed SSE chunks
        }
      }
    }

    return fullContent;
  }
}

function buildChatMessages(
  systemPrompt: string,
  history: ChatMessage[],
  historyTokenBudget: number,
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // Add history, trimming oldest first if over budget
  let tokenCount = 0;
  const historyMessages: Array<{ role: string; content: string }> = [];

  // Work backwards from most recent to preserve recent context
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]!;
    const tokens = estimateTokens(msg.content);
    if (tokenCount + tokens > historyTokenBudget) break;
    tokenCount += tokens;
    historyMessages.unshift({ role: msg.role, content: msg.content });
  }

  messages.push(...historyMessages);
  return messages;
}
