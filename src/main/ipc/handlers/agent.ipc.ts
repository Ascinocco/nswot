import { randomUUID } from 'crypto';
import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { registerPendingApproval } from '../agent-approval';
import type { IPCResult, Analysis, SwotOutput, SummariesOutput } from '../../domain/types';
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

      try {
        const modelId = input.modelId;
        // Store user message
        await chatRepo.insert(input.analysisId, 'user', input.content);

        // Build message history for LLM with system prompt
        const analysis = await analysisRepo.findById(input.analysisId);
        const systemPrompt = buildAgentSystemPrompt(analysis);
        const history = await chatRepo.findByAnalysis(input.analysisId);
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: systemPrompt },
          ...history.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        ];

        // Execute agent turn with streaming callbacks
        const result = await agentService.executeTurn(apiKey, modelId, messages, {
          onChunk: (chunk) => {
            if (window && !window.isDestroyed()) {
              window.webContents.send(IPC_CHANNELS.CHAT_CHUNK, {
                analysisId: input.analysisId,
                chunk,
              });
            }
          },
          onThinking: (thinking) => {
            if (window && !window.isDestroyed()) {
              window.webContents.send(IPC_CHANNELS.AGENT_THINKING, {
                conversationId: input.conversationId,
                thinking,
              });
            }
          },
          onBlock: (block) => {
            if (window && !window.isDestroyed()) {
              window.webContents.send(IPC_CHANNELS.AGENT_BLOCK, {
                conversationId: input.conversationId,
                block,
              });
            }
          },
          onStateChange: (state: AgentState) => {
            if (window && !window.isDestroyed()) {
              window.webContents.send(IPC_CHANNELS.AGENT_STATE, {
                conversationId: input.conversationId,
                state,
              });
            }
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
            if (window && !window.isDestroyed()) {
              window.webContents.send(IPC_CHANNELS.AGENT_BLOCK, {
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
            }

            // Block until user decides — resolved by chat.ipc.ts APPROVE/REJECT handlers
            return registerPendingApproval(approvalId);
          },
          onTokenCount: (inputTokens, outputTokens) => {
            if (window && !window.isDestroyed()) {
              window.webContents.send(IPC_CHANNELS.AGENT_TOKEN_COUNT, {
                conversationId: input.conversationId,
                inputTokens,
                outputTokens,
              });
            }
          },
          onToolActivity: (toolName, status, message) => {
            if (window && !window.isDestroyed()) {
              window.webContents.send(IPC_CHANNELS.AGENT_TOOL_ACTIVITY, {
                conversationId: input.conversationId,
                toolName,
                status,
                message,
              });
            }
          },
        });

        if (!result.ok) {
          return toIpcError(result.error);
        }

        // Store assistant response (persist if there's text content or blocks)
        if (result.value.content || result.value.blocks.length > 0) {
          const contentToStore = result.value.blocks.length > 0
            ? JSON.stringify(result.value.blocks)
            : result.value.content;
          const contentFormat = result.value.blocks.length > 0 ? 'blocks' : 'text';
          await chatRepo.insert(
            input.analysisId,
            'assistant',
            contentToStore,
            contentFormat,
          );
        }

        // Touch conversation timestamp
        await conversationService.touch(input.conversationId);

        return toIpcResult({
          content: result.value.content,
          blocks: result.value.blocks,
        });
      } catch (cause) {
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
  Input format: { "chartType": "bar"|"pie"|"line"|"doughnut"|"radar", "data": { "labels": ["Label1", "Label2"], "datasets": [{ "label": "Series Name", "data": [10, 20], "backgroundColor": ["#3b82f6", "#ef4444"] }] }, "title": "Chart Title" }
  - For pie/doughnut: use a single dataset with backgroundColor array matching labels.
  - For bar/line: labels are x-axis categories, datasets contain y-values.

- **render_mermaid**: Use for architecture diagrams, flowcharts, sequence diagrams, or any structural visualization.
  Input format: { "source": "graph TD\\n  A[Start] --> B[End]" }
  - Use valid Mermaid syntax (graph, flowchart, sequenceDiagram, classDiagram, etc.).

- **render_data_table**: Use for tabular data comparisons, rankings, or structured listings.
  Input format: { "title": "Table Title", "headers": ["Col1", "Col2"], "rows": [["val1", "val2"], ["val3", "val4"]] }

You can combine text explanation with render tools in the same response — for example, explain a trend and then show a chart illustrating it.`;

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
