import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../channels';
import type { IPCResult, ChatMessage } from '../../domain/types';
import type { ChatService } from '../../services/chat.service';
import { DomainError, ERROR_CODES } from '../../domain/errors';

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

      const result = await chatService.sendMessage(analysisId, content, onChunk);
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
}
