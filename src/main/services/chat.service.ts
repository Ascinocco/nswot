import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { ChatMessage, Analysis, SwotOutput, SummariesOutput, ChatAction, ActionResult, ActionToolName } from '../domain/types';
import type { ChatRepository } from '../repositories/chat.repository';
import type { ChatActionRepository } from '../repositories/chat-action.repository';
import type { AnalysisRepository } from '../repositories/analysis.repository';
import type { SettingsService } from './settings.service';
import type { ActionExecutor } from '../providers/actions/action-executor';
import { getToolsByIntegration, FILE_WRITE_TOOLS } from '../providers/actions/action-tools';
import type { ActionToolDefinition } from '../providers/actions/action-tools';
import { estimateTokens, trimToTokenBudget } from '../analysis/token-budget';
import type { LLMProvider } from '../providers/llm/llm-provider.interface';

const CHAT_TEMPERATURE = 0.3;
const CHAT_MAX_TOKENS = 2048;

export interface EditorContext {
  filePath: string | null;
  contentPreview: string | null;
  selectedText: string | null;
}

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
  hasWorkspace?: boolean,
  editorContext?: EditorContext | null,
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
5. Keep responses focused and actionable. Avoid generic advice.`;

  if (!hasWorkspace && !(connectedIntegrations && connectedIntegrations.length > 0)) {
    prompt += '\n6. You cannot create files, execute code, or access external data. You can only discuss the analysis.';
  }

  if (connectedIntegrations && connectedIntegrations.length > 0) {
    prompt += buildActionsSection(analysis, connectedIntegrations);
  }

  if (hasWorkspace) {
    prompt += buildFileWriteSection();
  }

  if (editorContext && (editorContext.filePath || editorContext.selectedText)) {
    prompt += buildEditorContextSection(editorContext);
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

function buildFileWriteSection(): string {
  return [
    '\n\nFILE GENERATION:',
    'You can write files to the user\'s workspace. Use write_markdown_file, write_csv_file, or write_mermaid_file tools.',
    'The user must approve before any file is written.',
    'When generating files:',
    '1. Use descriptive file paths (e.g., "reports/swot-summary.md", "diagrams/architecture.mmd").',
    '2. Base file content on the SWOT analysis data.',
    '3. For markdown files, use proper formatting with headers, lists, and tables.',
    '4. For CSV files, include a header row and use comma separation.',
    '5. For Mermaid files, use valid Mermaid diagram syntax.',
  ].join('\n');
}

function buildEditorContextSection(context: EditorContext): string {
  const lines: string[] = ['\n\nEDITOR CONTEXT:'];
  lines.push('The user currently has the following file open in their editor:');

  if (context.filePath) {
    lines.push(`File: ${context.filePath}`);
  }

  if (context.selectedText) {
    lines.push(`\nSelected text:\n\`\`\`\n${context.selectedText}\n\`\`\``);
  } else if (context.contentPreview) {
    lines.push(`\nContent preview:\n\`\`\`\n${context.contentPreview}\n\`\`\``);
  }

  lines.push('\nYou may reference this file context when relevant to the user\'s questions.');

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
  private editorContext: EditorContext | null = null;
  private hasWorkspace = false;

  constructor(
    private readonly chatRepo: ChatRepository,
    private readonly analysisRepo: AnalysisRepository,
    private readonly settingsService: SettingsService,
    private readonly chatActionRepo?: ChatActionRepository,
    private readonly actionExecutor?: ActionExecutor,
    private readonly llmProvider?: LLMProvider,
  ) {}

  setEditorContext(context: EditorContext | null): void {
    this.editorContext = context;
  }

  getEditorContext(): EditorContext | null {
    return this.editorContext;
  }

  setWorkspaceOpen(open: boolean): void {
    this.hasWorkspace = open;
  }

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

    const apiKey = this.settingsService.getActiveApiKey();
    if (!apiKey) {
      return err(new DomainError(ERROR_CODES.LLM_AUTH_FAILED, 'API key is not configured'));
    }

    try {
      // Store user message
      const userMessage = await this.chatRepo.insert(analysisId, 'user', userContent);

      // Determine available tools based on connected integrations + file-write tools
      const connectedIntegrations = getConnectedIntegrations(analysis);
      const integrationTools = connectedIntegrations.length > 0
        ? getToolsByIntegration(connectedIntegrations)
        : [];
      const fileTools = this.hasWorkspace ? FILE_WRITE_TOOLS : [];
      const allTools = [...integrationTools, ...fileTools];
      const tools = allTools.length > 0 ? allTools : undefined;

      // Build messages array
      const systemPrompt = buildChatSystemPrompt(
        analysis,
        connectedIntegrations.length > 0 ? connectedIntegrations : undefined,
        this.hasWorkspace,
        this.editorContext,
      );
      const history = await this.chatRepo.findByAnalysis(analysisId);

      // Token budgeting: trim history if needed
      const contextWindow = 128_000; // Default; ideally fetched from model info
      const budget = calculateChatTokenBudget(contextWindow);

      let trimmedSystemPrompt = systemPrompt;
      if (estimateTokens(systemPrompt) > budget.systemPrompt) {
        trimmedSystemPrompt = trimToTokenBudget(systemPrompt, budget.systemPrompt);
      }

      const messages = buildChatMessages(trimmedSystemPrompt, history, budget.chatHistory);

      // Call LLM provider (with tools if available)
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

  async approveAction(
    actionId: string,
    onChunk: (chunk: string) => void,
  ): Promise<Result<ActionResult, DomainError>> {
    if (!this.chatActionRepo || !this.actionExecutor) {
      return err(new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Action support not configured'));
    }

    const action = await this.chatActionRepo.findById(actionId);
    if (!action) {
      return err(new DomainError(ERROR_CODES.ACTION_NOT_FOUND, `Action "${actionId}" not found`));
    }
    if (action.status !== 'pending') {
      return err(new DomainError(ERROR_CODES.ACTION_INVALID_STATUS, `Action is ${action.status}, expected pending`));
    }

    // Update status to approved, then executing
    await this.chatActionRepo.updateStatus(actionId, 'approved');
    await this.chatActionRepo.updateStatus(actionId, 'executing');

    // Extract the tool call ID and clean input for executor
    const { _toolCallId, ...cleanInput } = action.toolInput;
    const toolCallId = (_toolCallId as string) ?? `call_${actionId}`;

    try {
      // Execute via ActionExecutor
      const actionResult = await this.actionExecutor.execute(action.toolName, cleanInput);

      // Update action status based on result
      const finalStatus = actionResult.success ? 'completed' : 'failed';
      await this.chatActionRepo.updateStatus(actionId, finalStatus, actionResult);

      // Check if all sibling actions (same chatMessageId) are resolved
      const allResolved = await this.areAllSiblingActionsResolved(action);
      if (allResolved) {
        await this.continueAfterToolResults(action.analysisId, action.chatMessageId, onChunk);
      }

      return ok(actionResult);
    } catch (cause) {
      const failResult: ActionResult = {
        success: false,
        error: cause instanceof Error ? cause.message : 'Execution failed',
      };
      await this.chatActionRepo.updateStatus(actionId, 'failed', failResult);
      return ok(failResult);
    }
  }

  async rejectAction(
    actionId: string,
    onChunk: (chunk: string) => void,
  ): Promise<Result<void, DomainError>> {
    if (!this.chatActionRepo) {
      return err(new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Action support not configured'));
    }

    const action = await this.chatActionRepo.findById(actionId);
    if (!action) {
      return err(new DomainError(ERROR_CODES.ACTION_NOT_FOUND, `Action "${actionId}" not found`));
    }
    if (action.status !== 'pending') {
      return err(new DomainError(ERROR_CODES.ACTION_INVALID_STATUS, `Action is ${action.status}, expected pending`));
    }

    await this.chatActionRepo.updateStatus(actionId, 'rejected');

    // Check if all sibling actions are resolved
    const allResolved = await this.areAllSiblingActionsResolved(action);
    if (allResolved) {
      await this.continueAfterToolResults(action.analysisId, action.chatMessageId, onChunk);
    }

    return ok(undefined);
  }

  async editAction(
    actionId: string,
    editedInput: Record<string, unknown>,
  ): Promise<Result<void, DomainError>> {
    if (!this.chatActionRepo) {
      return err(new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Chat actions not available'));
    }

    try {
      const action = await this.chatActionRepo.findById(actionId);
      if (!action) {
        return err(new DomainError(ERROR_CODES.ACTION_NOT_FOUND, `Action ${actionId} not found`));
      }
      if (action.status !== 'pending') {
        return err(new DomainError(ERROR_CODES.ACTION_INVALID_STATUS, 'Can only edit pending actions'));
      }
      await this.chatActionRepo.updateToolInput(actionId, editedInput);
      return ok(undefined);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to edit action', cause));
    }
  }

  async listActions(analysisId: string): Promise<Result<ChatAction[], DomainError>> {
    if (!this.chatActionRepo) {
      return ok([]);
    }

    try {
      const actions = await this.chatActionRepo.findByAnalysis(analysisId);
      return ok(actions);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to list actions', cause));
    }
  }

  private async areAllSiblingActionsResolved(action: ChatAction): Promise<boolean> {
    if (!this.chatActionRepo || !action.chatMessageId) return true;
    const siblings = await this.chatActionRepo.findByAnalysis(action.analysisId);
    const related = siblings.filter((a) => a.chatMessageId === action.chatMessageId);
    return related.every((a) => a.status === 'completed' || a.status === 'failed' || a.status === 'rejected');
  }

  private async continueAfterToolResults(
    analysisId: string,
    chatMessageId: string | null,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    if (!this.chatActionRepo) return;

    const apiKey = this.settingsService.getActiveApiKey();
    if (!apiKey) return;

    const analysis = await this.analysisRepo.findById(analysisId);
    if (!analysis) return;

    // Get all resolved actions for this assistant message
    const allActions = await this.chatActionRepo.findByAnalysis(analysisId);
    const resolvedActions = allActions.filter((a) => a.chatMessageId === chatMessageId);

    const connectedIntegrations = getConnectedIntegrations(analysis);
    const systemPrompt = buildChatSystemPrompt(
      analysis,
      connectedIntegrations.length > 0 ? connectedIntegrations : undefined,
      this.hasWorkspace,
      this.editorContext,
    );
    const history = await this.chatRepo.findByAnalysis(analysisId);

    const contextWindow = 128_000;
    const budget = calculateChatTokenBudget(contextWindow);

    let trimmedSystemPrompt = systemPrompt;
    if (estimateTokens(systemPrompt) > budget.systemPrompt) {
      trimmedSystemPrompt = trimToTokenBudget(systemPrompt, budget.systemPrompt);
    }

    // Build messages: history up to but not including the assistant tool-call message,
    // then the assistant message with tool_calls, then tool results
    const messages = buildChatMessagesWithToolResults(
      trimmedSystemPrompt,
      history,
      resolvedActions,
      chatMessageId,
      budget.chatHistory,
    );

    // Stream continuation
    const integrationTools = connectedIntegrations.length > 0
      ? getToolsByIntegration(connectedIntegrations)
      : [];
    const fileTools = this.hasWorkspace ? FILE_WRITE_TOOLS : [];
    const allTools = [...integrationTools, ...fileTools];
    const tools = allTools.length > 0 ? allTools : undefined;

    const continuation = await this.streamCompletion(apiKey, analysis.modelId, messages, onChunk, tools);

    // Store the continuation as a new assistant message
    if (continuation.content) {
      await this.chatRepo.insert(analysisId, 'assistant', continuation.content);
    }
  }

  private async streamCompletion(
    apiKey: string,
    modelId: string,
    messages: Array<{ role: string; content?: string; tool_calls?: unknown[]; tool_call_id?: string }>,
    onChunk: (chunk: string) => void,
    tools?: ActionToolDefinition[],
  ): Promise<StreamResult> {
    if (!this.llmProvider) {
      throw new DomainError(ERROR_CODES.LLM_REQUEST_FAILED, 'No LLM provider configured');
    }

    const response = await this.llmProvider.createChatCompletion({
      apiKey,
      modelId,
      messages,
      tools: tools as unknown[],
      temperature: CHAT_TEMPERATURE,
      maxTokens: CHAT_MAX_TOKENS,
      onChunk,
    });

    const toolCalls: ParsedToolCall[] | null =
      response.toolCalls && response.toolCalls.length > 0
        ? response.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, arguments: tc.arguments }))
        : null;

    return { content: response.content, toolCalls };
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

function buildChatMessagesWithToolResults(
  systemPrompt: string,
  history: ChatMessage[],
  resolvedActions: ChatAction[],
  toolCallMessageId: string | null,
  historyTokenBudget: number,
): Array<{ role: string; content?: string; tool_calls?: unknown[]; tool_call_id?: string }> {
  const messages: Array<{ role: string; content?: string; tool_calls?: unknown[]; tool_call_id?: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // Add history up to and including the user message before the tool-call assistant message
  let tokenCount = 0;
  const historyMessages: Array<{ role: string; content?: string; tool_calls?: unknown[]; tool_call_id?: string }> = [];

  // Work backwards, but stop at (don't include) the tool-call assistant message
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]!;
    if (msg.id === toolCallMessageId) continue; // Skip the partial text message — we'll reconstruct it
    const tokens = estimateTokens(msg.content);
    if (tokenCount + tokens > historyTokenBudget) break;
    tokenCount += tokens;
    historyMessages.unshift({ role: msg.role, content: msg.content });
  }

  messages.push(...historyMessages);

  // Find the assistant message that triggered tool calls (for its text content)
  const toolCallMsg = history.find((m) => m.id === toolCallMessageId);
  const assistantContent = toolCallMsg?.content || '';

  // Reconstruct the assistant message with tool_calls
  const toolCalls = resolvedActions.map((a) => {
    const { _toolCallId, ...cleanInput } = a.toolInput;
    return {
      id: (_toolCallId as string) ?? `call_${a.id}`,
      type: 'function' as const,
      function: {
        name: a.toolName,
        arguments: JSON.stringify(cleanInput),
      },
    };
  });

  const assistantMsg: { role: string; content?: string; tool_calls?: unknown[] } = {
    role: 'assistant',
    tool_calls: toolCalls,
  };
  if (assistantContent) {
    assistantMsg.content = assistantContent;
  }
  messages.push(assistantMsg);

  // Add tool results for each resolved action
  for (const a of resolvedActions) {
    const toolCallId = (a.toolInput['_toolCallId'] as string) ?? `call_${a.id}`;
    let resultContent: string;
    if (a.status === 'rejected') {
      resultContent = 'User declined this action. Do not retry. Continue the conversation without creating it.';
    } else if (a.result) {
      resultContent = JSON.stringify(a.result);
    } else {
      resultContent = JSON.stringify({ success: false, error: 'No result available' });
    }
    messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      content: resultContent,
    });
  }

  return messages;
}
