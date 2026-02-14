import { randomUUID } from 'crypto';
import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { registerPendingApproval } from '../agent-approval';
import type { IPCResult, Analysis, SwotOutput, SummariesOutput, ChatMessage } from '../../domain/types';
import type { AgentService, AgentState, ContentBlock } from '../../services/agent.service';
import { generateBlockId } from '../../services/agent.service';
import type { ConversationService } from '../../services/conversation.service';
import type { ApprovalMemoryService } from '../../services/approval-memory.service';
import type { ChatRepository } from '../../repositories/chat.repository';
import type { AnalysisRepository } from '../../repositories/analysis.repository';
import type { SettingsService } from '../../services/settings.service';
import { DomainError, ERROR_CODES } from '../../domain/errors';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

/** Safe IPC send — skips if the window has been destroyed (e.g., user closed the window mid-operation). */
function safeSend(window: BrowserWindow | null, channel: string, data: unknown): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, data);
  }
}

export interface AgentSendInput {
  conversationId: string;
  analysisId: string;
  modelId: string;
  content: string;
}

export function registerAgentHandlers(
  agentService: AgentService,
  conversationService: ConversationService,
  approvalMemoryService: ApprovalMemoryService,
  chatRepo: ChatRepository,
  settingsService: SettingsService,
  analysisRepo: AnalysisRepository,
): void {
  ipcMain.handle(
    IPC_CHANNELS.AGENT_SEND,
    async (event, input: AgentSendInput): Promise<IPCResult<{ content: string; blocks: ContentBlock[] }>> => {
      const window = BrowserWindow.fromWebContents(event.sender);

      const apiKey = settingsService.getActiveApiKey();
      if (!apiKey) {
        return toIpcError(
          new DomainError(ERROR_CODES.LLM_AUTH_FAILED, 'API key is not configured'),
        );
      }

      let userMessageId: string | null = null;
      try {
        const modelId = input.modelId;
        // Store user message (track ID for cleanup on failure)
        const userMessage = await chatRepo.insert(input.analysisId, 'user', input.content);
        userMessageId = userMessage.id;

        // Build message history for LLM with system prompt
        const analysis = await analysisRepo.findById(input.analysisId);
        const systemPrompt = buildAgentSystemPrompt(analysis);
        const history = await chatRepo.findByAnalysis(input.analysisId);
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: systemPrompt },
          ...history.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: extractTextForLlm(m),
          })),
        ];

        // Execute agent turn with streaming callbacks
        const result = await agentService.executeTurn(apiKey, modelId, messages, {
          onChunk: (chunk) => {
            safeSend(window, IPC_CHANNELS.CHAT_CHUNK, {
              analysisId: input.analysisId,
              chunk,
            });
          },
          onThinking: (thinking) => {
            safeSend(window, IPC_CHANNELS.AGENT_THINKING, {
              conversationId: input.conversationId,
              thinking,
            });
          },
          onBlock: (block) => {
            safeSend(window, IPC_CHANNELS.AGENT_BLOCK, {
              conversationId: input.conversationId,
              block,
            });
          },
          onStateChange: (state: AgentState) => {
            safeSend(window, IPC_CHANNELS.AGENT_STATE, {
              conversationId: input.conversationId,
              state,
            });
          },
          onApprovalRequest: async (toolName, toolInput) => {
            // Check approval memory first — auto-approve if remembered
            const isAutoApproved = await approvalMemoryService.isToolApproved(
              input.conversationId,
              toolName,
            );
            if (isAutoApproved) {
              return true;
            }

            // Emit an approval content block for the renderer to display
            const approvalId = randomUUID();
            safeSend(window, IPC_CHANNELS.AGENT_BLOCK, {
              conversationId: input.conversationId,
              block: {
                type: 'approval',
                id: generateBlockId(),
                data: {
                  id: approvalId,
                  analysisId: input.analysisId,
                  chatMessageId: null,
                  toolName,
                  toolInput,
                  status: 'pending',
                  result: null,
                  createdAt: new Date().toISOString(),
                  executedAt: null,
                },
              },
            });

            // Block until user decides (with timeout) — resolved by chat.ipc.ts APPROVE/REJECT handlers
            const result = await registerPendingApproval(approvalId, {
              conversationId: input.conversationId,
              toolName,
            });

            // If user chose "Remember", store the decision
            if (result.remember) {
              await approvalMemoryService.remember(
                input.conversationId,
                toolName,
                result.approved,
              );
            }

            return result.approved;
          },
          onTokenCount: (inputTokens, outputTokens) => {
            safeSend(window, IPC_CHANNELS.AGENT_TOKEN_COUNT, {
              conversationId: input.conversationId,
              inputTokens,
              outputTokens,
            });
          },
          onToolActivity: (toolName, status, message) => {
            safeSend(window, IPC_CHANNELS.AGENT_TOOL_ACTIVITY, {
              conversationId: input.conversationId,
              toolName,
              status,
              message,
            });
          },
        });

        if (!result.ok) {
          // Clean up orphaned user message when agent turn completely fails
          await chatRepo.deleteById(userMessage.id).catch(() => {});
          return toIpcError(result.error);
        }

        // Store assistant response (persist if there's text content or blocks)
        if (result.value.content || result.value.blocks.length > 0) {
          if (result.value.blocks.length > 0) {
            // When we have blocks, also preserve any text content as a leading text block
            const blocksToStore = result.value.content
              ? [
                  { type: 'text', id: generateBlockId(), data: { text: result.value.content } },
                  ...result.value.blocks,
                ]
              : result.value.blocks;
            await chatRepo.insert(
              input.analysisId,
              'assistant',
              JSON.stringify(blocksToStore),
              'blocks',
            );
          } else {
            await chatRepo.insert(
              input.analysisId,
              'assistant',
              result.value.content,
              'text',
            );
          }
        }

        // Touch conversation timestamp
        await conversationService.touch(input.conversationId);

        return toIpcResult({
          content: result.value.content,
          blocks: result.value.blocks,
        });
      } catch (cause) {
        // Clean up orphaned user message on unexpected failure
        if (userMessageId) {
          await chatRepo.deleteById(userMessageId).catch(() => {});
        }
        return toIpcError(
          new DomainError(
            ERROR_CODES.LLM_REQUEST_FAILED,
            cause instanceof Error ? cause.message : 'Agent request failed',
          ),
        );
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_INTERRUPT,
    async (): Promise<IPCResult<void>> => {
      agentService.interrupt();
      return toIpcResult<void>(undefined);
    },
  );
}

/**
 * Extract text content from a ChatMessage for LLM context.
 * For block-format messages, extracts text from text blocks (skipping thinking, charts, etc.).
 * For text-format messages, returns content as-is.
 */
function extractTextForLlm(message: ChatMessage): string {
  if (message.contentFormat !== 'blocks' || !message.blocks) {
    return message.content;
  }

  const textParts: string[] = [];
  const nonTextTypes: string[] = [];
  for (const block of message.blocks) {
    if (block.type === 'text') {
      textParts.push((block.data as { text: string }).text);
    } else {
      nonTextTypes.push(block.type);
    }
  }

  // When no text blocks exist, generate a human-readable summary instead of raw JSON
  if (textParts.length === 0) {
    const BLOCK_LABELS: Record<string, string> = {
      thinking: 'thinking/reasoning',
      swot_analysis: 'SWOT analysis results',
      summary_cards: 'summary cards',
      quality_metrics: 'quality metrics',
      mermaid: 'Mermaid diagram',
      chart: 'chart visualization',
      data_table: 'data table',
      comparison: 'comparison results',
      approval: 'tool approval request',
      action_status: 'action status',
    };
    const labels = nonTextTypes.map((t) => BLOCK_LABELS[t] ?? t);
    return `[Assistant provided: ${labels.join(', ')}]`;
  }

  return textParts.join('\n\n');
}

function formatSwotSection(swot: SwotOutput): string {
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

function formatSummariesSection(summaries: SummariesOutput): string {
  const parts: string[] = ['## Source Summaries'];
  parts.push(`\n### Stakeholder Interview Summary\n${summaries.profiles}`);
  parts.push(`\n### Jira Data Summary\n${summaries.jira}`);
  if (summaries.confluence) {
    parts.push(`\n### Confluence Summary\n${summaries.confluence}`);
  }
  if (summaries.github) {
    parts.push(`\n### GitHub Summary\n${summaries.github}`);
  }
  if (summaries.codebase) {
    parts.push(`\n### Codebase Summary\n${summaries.codebase}`);
  }
  return parts.join('\n');
}

function buildAgentSystemPrompt(analysis: Analysis | null): string {
  if (!analysis) {
    return `You are an AI analyst assistant. No analysis data is available yet. Let the user know that the analysis has not been completed or could not be found.

Use markdown formatting in your responses: **bold** for emphasis, headers for sections, bullet points for lists, and code blocks where appropriate.`;
  }

  const role = analysis.role === 'staff_engineer'
    ? 'Staff Engineer'
    : analysis.role === 'senior_em'
      ? 'Senior Engineering Manager'
      : 'VP of Engineering';

  let prompt = `You are an AI analyst assistant for an organizational SWOT analysis. You help the user explore analysis results, understand evidence, create visualizations, and plan actions.

CONTEXT:
The user has completed a SWOT analysis as a ${role}. The full analysis results are provided below. All stakeholder names are anonymized.

RULES:
1. Ground every response in the analysis data provided. If the user asks about something not covered, say so explicitly.
2. Do not invent information. Only reference data from the analysis.
3. When suggesting actions, tailor them to the ${role} role.
4. Clearly distinguish between "the data shows X" and "this suggests Y".
5. Keep responses focused and actionable.
6. Use markdown formatting: **bold** for emphasis, headers for sections, bullet points for lists, code blocks where appropriate.

RENDER TOOL INSTRUCTIONS:
You have render tools available for creating rich visualizations. ALWAYS prefer using these tools over describing data in plain text.

- **render_chart**: Use when the user asks for charts, graphs, or visualizations (bar charts, pie charts, line graphs, etc.).
  Input format: { "title": "Chart Title", "chartType": "bar"|"pie"|"line"|"doughnut"|"radar", "spec": { "data": { "labels": ["Label1", "Label2"], "datasets": [{ "label": "Series Name", "data": [10, 20], "backgroundColor": ["#3b82f6", "#ef4444"] }] } } }
  - The "spec" object wraps the Chart.js config. Put "labels" and "datasets" inside spec.data.
  - For pie/doughnut: use a single dataset with backgroundColor array matching labels.
  - For bar/line: labels are x-axis categories, datasets contain y-values.

- **render_mermaid**: Use for architecture diagrams, flowcharts, sequence diagrams, or any structural visualization.
  Input format: { "source": "graph TD\\n  A[Start] --> B[End]" }
  - Use valid Mermaid syntax (graph, flowchart, sequenceDiagram, classDiagram, etc.).

- **render_data_table**: Use for tabular data comparisons, rankings, or structured listings.
  Input format: { "title": "Table Title", "headers": ["Col1", "Col2"], "rows": [["val1", "val2"], ["val3", "val4"]] }

You can combine text explanation with render tools in the same response — for example, explain a trend and then show a chart illustrating it.

READ TOOL INSTRUCTIONS:
You have read tools that query LOCALLY CACHED data from the last sync — they do NOT make live API calls.

- **fetch_jira_data**: Returns cached Jira epics (key, summary, status, priority, type, labels) and stories (same fields) and comments (body text, issue key). Does NOT include sprint metadata, story points, velocity, burndown data, or time tracking. Use only when you need specific issue details not already in the analysis summaries below.
- **fetch_confluence_data**: Returns cached Confluence pages and comments. Use for specific page content not in the summaries.
- **fetch_github_data**: Returns cached GitHub PRs, issues, and comments. Use for specific PR/issue details not in the summaries.
- **search_profiles**: Searches stakeholder profiles by keyword or tags. Use to find specific stakeholder quotes or concerns.
- **list_jira_projects**: Lists all available Jira projects (key, name, type). Use this to discover project keys before fetching data or creating issues. Makes a LIVE API call (not cached).
- **list_confluence_spaces**: Lists all available Confluence spaces (key, name, type). Use this to discover space keys before fetching pages or creating content. Makes a LIVE API call (not cached).

IMPORTANT: The ANALYSIS DATA section below already contains comprehensive summaries of all data sources. Use that FIRST for answering questions. Only call read tools when the user asks for specific raw details (e.g., "show me all open stories for project X" or "what did Stakeholder C say about performance?"). Do NOT call read tools to get data types that were never synced (sprint velocity, story points, burndown metrics, etc.).

WRITE TOOL INSTRUCTIONS:
You have write tools that create or update items in external systems (Jira, Confluence, GitHub). Each write tool execution spawns a separate subprocess with a timeout, so large or batch operations can fail.

- **create_jira_issue**: Creates a single Jira issue (epic, story, task, bug). ALWAYS prefer this over batch creation.
- **create_confluence_page**: Creates a single Confluence page.
- **create_github_issue**: Creates a single GitHub issue.

IMPORTANT RULES FOR WRITE TOOLS:
1. NEVER use batch creation tools (e.g., create_jira_issues). They attempt too many API calls in a single subprocess and will time out.
2. Create issues ONE AT A TIME. Call create_jira_issue once, wait for the result, then call it again for the next issue.
3. When creating multiple related items (e.g., an epic + stories), create the parent first, confirm success, then create children one by one.
4. If a write tool times out, do NOT retry with a larger batch. Instead, retry the single item.
5. Always confirm each creation result with the user before proceeding to the next item.`;

  prompt += '\n\nANALYSIS DATA:';

  if (analysis.swotOutput) {
    prompt += '\n\n' + formatSwotSection(analysis.swotOutput);
  } else {
    prompt += '\n\n(No SWOT results available yet — the analysis may still be running or may have failed.)';
  }

  if (analysis.summariesOutput) {
    prompt += '\n\n' + formatSummariesSection(analysis.summariesOutput);
  }

  return prompt;
}
