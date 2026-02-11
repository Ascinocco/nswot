import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { ChatMessage, Analysis, SwotOutput, SummariesOutput, ChatAction, ActionResult, ActionToolName } from '../domain/types';
import type { ChatRepository } from '../repositories/chat.repository';
import type { ChatActionRepository } from '../repositories/chat-action.repository';
import type { AnalysisRepository } from '../repositories/analysis.repository';
import type { SettingsService } from './settings.service';
import type { ActionExecutor } from '../providers/actions/action-executor';
import { getToolsByIntegration } from '../providers/actions/action-tools';
import type { ActionToolDefinition } from '../providers/actions/action-tools';
import { estimateTokens, trimToTokenBudget } from '../analysis/token-budget';

const CHAT_TEMPERATURE = 0.3;
const CHAT_MAX_TOKENS = 2048;
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface ParsedToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface StreamResult {
  content: string;
  toolCalls: ParsedToolCall[] | null;
}

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

export function getConnectedIntegrations(analysis: Analysis): string[] {
  const connected: string[] = [];
  if (analysis.config.jiraProjectKeys.length > 0) connected.push('jira');
  if (analysis.config.confluenceSpaceKeys.length > 0) connected.push('confluence');
  if (analysis.config.githubRepos.length > 0) connected.push('github');
  return connected;
}

export function buildChatSystemPrompt(
  analysis: Analysis,
  connectedIntegrations?: string[],
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
6. You cannot create files, execute code, or access external data. You can only discuss the analysis.`;

  if (connectedIntegrations && connectedIntegrations.length > 0) {
    prompt += buildActionsSection(analysis, connectedIntegrations);
  }

  prompt += '\n\nANALYSIS DATA:';

  if (swot) {
    prompt += '\n\n' + formatSwotForChat(swot);
  }

  if (summaries) {
    prompt += `\n\n## Source Summaries\n\n### Stakeholder Interview Summary\n${summaries.profiles}\n\n### Jira Data Summary\n${summaries.jira}`;
  }

  return prompt;
}

function buildActionsSection(analysis: Analysis, connectedIntegrations: string[]): string {
  const lines: string[] = [
    '\n\nACTIONS:',
    'You have tools available to create artifacts in the user\'s systems (Jira, Confluence, GitHub).',
    'When the user asks you to create something:',
    '1. Use the appropriate tool with well-structured, detailed content.',
    '2. Base all content on the SWOT analysis data — reference specific findings, evidence, and recommendations.',
    '3. Write descriptions in clear markdown with context from the analysis.',
    '4. For Jira issues, include acceptance criteria when relevant.',
    '5. For Confluence pages, structure content with headers, findings, and action items.',
    '6. The user will review your draft before it\'s created — be thorough rather than brief.',
    '7. When creating multiple related items (e.g., epic + stories), use create_jira_issues to batch them.',
  ];

  if (connectedIntegrations.includes('jira')) {
    const projectKeys = analysis.config.jiraProjectKeys.join(', ') || 'any';
    lines.push(`\nAvailable Jira projects: ${projectKeys}`);
  }
  if (connectedIntegrations.includes('confluence')) {
    const spaceKeys = analysis.config.confluenceSpaceKeys.join(', ') || 'any';
    lines.push(`Available Confluence spaces: ${spaceKeys}`);
  }
  if (connectedIntegrations.includes('github')) {
    const repoNames = analysis.config.githubRepos.join(', ') || 'any';
    lines.push(`Available GitHub repos: ${repoNames}`);
  }

  return lines.join('\n');
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
    private readonly chatActionRepo?: ChatActionRepository,
    private readonly actionExecutor?: ActionExecutor,
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
    onAction?: (action: ChatAction) => void,
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

      // Determine available tools based on connected integrations
      const connectedIntegrations = getConnectedIntegrations(analysis);
      const tools = connectedIntegrations.length > 0
        ? getToolsByIntegration(connectedIntegrations)
        : undefined;

      // Build messages array
      const systemPrompt = buildChatSystemPrompt(analysis, connectedIntegrations.length > 0 ? connectedIntegrations : undefined);
      const history = await this.chatRepo.findByAnalysis(analysisId);

      // Token budgeting: trim history if needed
      const contextWindow = 128_000; // Default; ideally fetched from model info
      const budget = calculateChatTokenBudget(contextWindow);

      let trimmedSystemPrompt = systemPrompt;
      if (estimateTokens(systemPrompt) > budget.systemPrompt) {
        trimmedSystemPrompt = trimToTokenBudget(systemPrompt, budget.systemPrompt);
      }

      const messages = buildChatMessages(trimmedSystemPrompt, history, budget.chatHistory);

      // Call OpenRouter (with tools if available)
      const streamResult = await this.streamCompletion(
        apiKey,
        analysis.modelId,
        messages,
        onChunk,
        tools,
      );

      // Store assistant message (may be partial text if tool_calls detected)
      const assistantMessage = await this.chatRepo.insert(
        analysisId,
        'assistant',
        streamResult.content,
      );

      // If tool calls were detected, create pending actions
      if (streamResult.toolCalls && streamResult.toolCalls.length > 0 && this.chatActionRepo) {
        for (const tc of streamResult.toolCalls) {
          let toolInput: Record<string, unknown>;
          try {
            toolInput = JSON.parse(tc.arguments) as Record<string, unknown>;
          } catch {
            toolInput = { _rawArguments: tc.arguments };
          }
          // Store tool_call_id for conversation continuation
          toolInput['_toolCallId'] = tc.id;

          const action = await this.chatActionRepo.insert(
            analysisId,
            tc.name as ActionToolName,
            toolInput,
            assistantMessage.id,
          );
          onAction?.(action);
        }
      }

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
