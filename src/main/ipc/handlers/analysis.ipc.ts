import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { match } from '../../domain/result';
import type { IPCResult, Analysis } from '../../domain/types';
import type { AnalysisRepository } from '../../repositories/analysis.repository';
import type { WorkspaceService } from '../../services/workspace.service';
import { DomainError, ERROR_CODES } from '../../domain/errors';
import { ok, err } from '../../domain/result';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerAnalysisHandlers(
  analysisRepo: AnalysisRepository,
  workspaceService: WorkspaceService,
): void {
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_LIST,
    async (): Promise<IPCResult<Analysis[]>> => {
      const workspaceId = workspaceService.getCurrentId();
      if (!workspaceId) {
        return toIpcError(
          new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'),
        );
      }
      try {
        const analyses = await analysisRepo.findByWorkspace(workspaceId);
        return toIpcResult(analyses);
      } catch (cause) {
        return toIpcError(
          new DomainError(ERROR_CODES.DB_ERROR, 'Failed to list analyses'),
        );
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_GET,
    async (_event, id: string): Promise<IPCResult<Analysis>> => {
      try {
        const analysis = await analysisRepo.findById(id);
        if (!analysis) {
          return toIpcError(
            new DomainError(ERROR_CODES.INTERNAL_ERROR, `Analysis "${id}" not found`),
          );
        }
        return toIpcResult(analysis);
      } catch (cause) {
        return toIpcError(
          new DomainError(ERROR_CODES.DB_ERROR, 'Failed to get analysis'),
        );
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_DELETE,
    async (_event, id: string): Promise<IPCResult<void>> => {
      try {
        const analysis = await analysisRepo.findById(id);
        if (!analysis) {
          return toIpcError(
            new DomainError(ERROR_CODES.INTERNAL_ERROR, `Analysis "${id}" not found`),
          );
        }
        await analysisRepo.delete(id);
        return toIpcResult<void>(undefined);
      } catch (cause) {
        return toIpcError(
          new DomainError(ERROR_CODES.DB_ERROR, 'Failed to delete analysis'),
        );
      }
    },
  );
}
