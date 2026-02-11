import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../channels';
import type { IPCResult, ChatMessage, ChatAction, ActionResult } from '../../domain/types';
import type { ChatService } from '../../services/chat.service';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerChatHandlers(chatService: ChatService): void {
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
          window.webContents.send('chat:chunk', { analysisId, chunk });
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
    async (event, actionId: string): Promise<IPCResult<ActionResult>> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const onChunk = (chunk: string): void => {
        if (window && !window.isDestroyed()) {
          window.webContents.send('chat:chunk', { chunk });
        }
      };

      const result = await chatService.approveAction(actionId, onChunk);
      if (result.ok) return toIpcResult(result.value);
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_ACTION_REJECT,
    async (event, actionId: string): Promise<IPCResult<void>> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const onChunk = (chunk: string): void => {
        if (window && !window.isDestroyed()) {
          window.webContents.send('chat:chunk', { chunk });
        }
      };

      const result = await chatService.rejectAction(actionId, onChunk);
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
}
