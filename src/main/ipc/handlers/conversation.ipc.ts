import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import type { IPCResult, Conversation } from '../../domain/types';
import type { ConversationService } from '../../services/conversation.service';
import { DomainError, ERROR_CODES } from '../../domain/errors';
import type { Analysis } from '../../domain/types';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerConversationHandlers(
  conversationService: ConversationService,
): void {
  ipcMain.handle(
    IPC_CHANNELS.CONVERSATION_LIST,
    async (): Promise<IPCResult<Conversation[]>> => {
      const result = await conversationService.list();
      if (result.ok) return toIpcResult(result.value);
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONVERSATION_GET,
    async (_event, id: string): Promise<IPCResult<Conversation>> => {
      const result = await conversationService.get(id);
      if (result.ok) return toIpcResult(result.value);
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONVERSATION_CREATE,
    async (_event, role: Analysis['role']): Promise<IPCResult<Conversation>> => {
      const result = await conversationService.create(role);
      if (result.ok) return toIpcResult(result.value);
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONVERSATION_UPDATE_TITLE,
    async (_event, id: string, title: string): Promise<IPCResult<void>> => {
      const result = await conversationService.updateTitle(id, title);
      if (result.ok) return toIpcResult<void>(undefined);
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONVERSATION_DELETE,
    async (_event, id: string): Promise<IPCResult<void>> => {
      const result = await conversationService.delete(id);
      if (result.ok) return toIpcResult<void>(undefined);
      return toIpcError(result.error);
    },
  );
}
