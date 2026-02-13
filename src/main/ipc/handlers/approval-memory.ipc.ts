import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import type { IPCResult } from '../../domain/types';
import type { ApprovalMemoryService } from '../../services/approval-memory.service';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerApprovalMemoryHandlers(
  approvalMemoryService: ApprovalMemoryService,
): void {
  ipcMain.handle(
    IPC_CHANNELS.APPROVAL_MEMORY_LIST,
    async (_event, conversationId: string): Promise<IPCResult<Array<{ toolName: string; allowed: boolean }>>> => {
      try {
        const entries = await approvalMemoryService.list(conversationId);
        return toIpcResult(
          entries.map((e) => ({ toolName: e.toolName, allowed: e.allowed })),
        );
      } catch (cause) {
        return toIpcError({
          code: 'DB_ERROR',
          message: cause instanceof Error ? cause.message : 'Failed to list approval memory',
        });
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.APPROVAL_MEMORY_SET,
    async (
      _event,
      conversationId: string,
      toolName: string,
      allowed: boolean,
    ): Promise<IPCResult<void>> => {
      try {
        await approvalMemoryService.remember(conversationId, toolName, allowed);
        return toIpcResult<void>(undefined);
      } catch (cause) {
        return toIpcError({
          code: 'DB_ERROR',
          message: cause instanceof Error ? cause.message : 'Failed to set approval memory',
        });
      }
    },
  );
}
