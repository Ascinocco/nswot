import { randomUUID } from 'crypto';
import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { registerPendingApproval } from '../agent-approval';
import type { IPCResult } from '../../domain/types';
import type { AgentService, AgentState, ContentBlock } from '../../services/agent.service';
import { generateBlockId } from '../../services/agent.service';
import type { ConversationService } from '../../services/conversation.service';
import type { ApprovalMemoryService } from '../../services/approval-memory.service';
import type { ChatRepository } from '../../repositories/chat.repository';
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

        // Build message history for LLM
        const history = await chatRepo.findByAnalysis(input.analysisId);
        const messages = history.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

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
