import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { resolveAgentApproval } from '../agent-approval';
import type { IPCResult, ChatMessage, ChatAction, ActionResult } from '../../domain/types';
import type { ChatService } from '../../services/chat.service';
import type { EditorContext } from '../../services/chat.service';
import type { ApprovalMemoryService } from '../../services/approval-memory.service';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerChatHandlers(
  chatService: ChatService,
  approvalMemoryService?: ApprovalMemoryService,
): void {
  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_MESSAGES,
    async (_event, analysisId: string): Promise<IPCResult<ChatMessage[]>> => {
      const result = await chatService.getMessages(analysisId);
      if (result.ok) return toIpcResult(result.value);
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND,
    async (event, analysisId: string, content: string): Promise<IPCResult<ChatMessage>> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const onChunk = (chunk: string): void => {
        if (window && !window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.CHAT_CHUNK, { analysisId, chunk });
        }
      };
      const onAction = (action: ChatAction): void => {
        if (window && !window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.CHAT_ACTION_PENDING, action);
        }
      };

      const result = await chatService.sendMessage(analysisId, content, onChunk, onAction);
      if (result.ok) return toIpcResult(result.value);
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_DELETE,
    async (_event, analysisId: string): Promise<IPCResult<void>> => {
      const result = await chatService.deleteMessages(analysisId);
      if (result.ok) return toIpcResult<void>(undefined);
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_ACTION_APPROVE,
    async (event, analysisId: string, actionId: string, remember?: boolean): Promise<IPCResult<ActionResult>> => {
      // Check if this is a Phase 4 agent approval (pending promise in agent loop)
      const metadata = resolveAgentApproval(actionId, true, remember ?? false);
      if (metadata) {
        // Agent approval resolved — memory is handled inside agent.ipc.ts onApprovalRequest
        return toIpcResult({ success: true } as ActionResult);
      }

      // Phase 3c flow: execute the action via ChatService
      const window = BrowserWindow.fromWebContents(event.sender);
      const onChunk = (chunk: string): void => {
        if (window && !window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.CHAT_CHUNK, { analysisId, chunk });
        }
      };

      const result = await chatService.approveAction(actionId, onChunk);
      if (result.ok) return toIpcResult(result.value);
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_ACTION_REJECT,
    async (event, analysisId: string, actionId: string): Promise<IPCResult<void>> => {
      // Check if this is a Phase 4 agent rejection (pending promise in agent loop)
      const metadata = resolveAgentApproval(actionId, false);
      if (metadata) {
        return toIpcResult<void>(undefined);
      }

      // Phase 3c flow: reject via ChatService
      const window = BrowserWindow.fromWebContents(event.sender);
      const onChunk = (chunk: string): void => {
        if (window && !window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.CHAT_CHUNK, { analysisId, chunk });
        }
      };

      const result = await chatService.rejectAction(actionId, onChunk);
      if (result.ok) return toIpcResult<void>(undefined);
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_ACTION_EDIT,
    async (_event, actionId: string, editedInput: Record<string, unknown>): Promise<IPCResult<void>> => {
      const result = await chatService.editAction(actionId, editedInput);
      if (result.ok) return toIpcResult<void>(undefined);
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_ACTION_LIST,
    async (_event, analysisId: string): Promise<IPCResult<ChatAction[]>> => {
      const result = await chatService.listActions(analysisId);
      if (result.ok) return toIpcResult(result.value);
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_SET_EDITOR_CONTEXT,
    async (_event, context: EditorContext | null): Promise<IPCResult<void>> => {
      chatService.setEditorContext(context);
      return toIpcResult<void>(undefined);
    },
  );
}
