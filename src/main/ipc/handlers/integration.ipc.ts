import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { match } from '../../domain/result';
import type { IntegrationService } from '../../services/integration.service';
import type { IPCResult } from '../../domain/types';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerIntegrationHandlers(integrationService: IntegrationService): void {
  ipcMain.handle(
    IPC_CHANNELS.INTEGRATION_GET,
    async (): Promise<IPCResult<unknown>> => {
      const result = await integrationService.getIntegration();
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.INTEGRATION_CONNECT_JIRA,
    async (_event, clientId: string, clientSecret: string): Promise<IPCResult<unknown>> => {
      const result = await integrationService.connectJira(clientId, clientSecret);
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.INTEGRATION_DISCONNECT,
    async (): Promise<IPCResult<void>> => {
      const result = await integrationService.disconnect();
      return match(result, {
        ok: () => toIpcResult<void>(undefined),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.INTEGRATION_SYNC,
    async (_event, projectKeys: string[]): Promise<IPCResult<unknown>> => {
      const result = await integrationService.sync(projectKeys);
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.INTEGRATION_LIST_PROJECTS,
    async (): Promise<IPCResult<unknown>> => {
      const result = await integrationService.listProjects();
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );
}
