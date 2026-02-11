import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { match } from '../../domain/result';
import type { ConfluenceService } from '../../services/confluence.service';
import type { IPCResult } from '../../domain/types';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerConfluenceHandlers(confluenceService: ConfluenceService): void {
  ipcMain.handle(
    IPC_CHANNELS.CONFLUENCE_GET,
    async (): Promise<IPCResult<unknown>> => {
      const result = await confluenceService.getIntegration();
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONFLUENCE_CONNECT,
    async (): Promise<IPCResult<unknown>> => {
      const result = await confluenceService.connect();
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONFLUENCE_DISCONNECT,
    async (): Promise<IPCResult<void>> => {
      const result = await confluenceService.disconnect();
      return match(result, {
        ok: () => toIpcResult<void>(undefined),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONFLUENCE_LIST_SPACES,
    async (): Promise<IPCResult<unknown>> => {
      const result = await confluenceService.listSpaces();
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONFLUENCE_SYNC,
    async (_event, spaceKeys: string[]): Promise<IPCResult<unknown>> => {
      const result = await confluenceService.sync(spaceKeys);
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );
}
