import { ipcMain, dialog } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { match } from '../../domain/result';
import type { WorkspaceService } from '../../services/workspace.service';
import type { IPCResult, Workspace } from '../../domain/types';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerWorkspaceHandlers(
  workspaceService: WorkspaceService,
  onWorkspaceOpen?: (path: string) => void,
): void {
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_OPEN,
    async (): Promise<IPCResult<Workspace | null>> => {
      const dialogResult = await dialog.showOpenDialog({
        properties: ['openDirectory'],
      });

      if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
        return toIpcResult(null);
      }

      const selectedPath = dialogResult.filePaths[0]!;
      const result = await workspaceService.open(selectedPath);
      return match(result, {
        ok: (data) => {
          if (data && onWorkspaceOpen) onWorkspaceOpen(data.path);
          return toIpcResult<Workspace | null>(data);
        },
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_GET_CURRENT,
    async (): Promise<IPCResult<Workspace | null>> => {
      const result = await workspaceService.getCurrent();
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );
}
