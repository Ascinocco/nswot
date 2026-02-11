import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../channels';
import type { IPCResult, Analysis } from '../../domain/types';
import type { AnalysisRepository } from '../../repositories/analysis.repository';
import type { AnalysisService, RunAnalysisInput } from '../../services/analysis.service';
import type { WorkspaceService } from '../../services/workspace.service';
import { DomainError, ERROR_CODES } from '../../domain/errors';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerAnalysisHandlers(
  analysisRepo: AnalysisRepository,
  analysisService: AnalysisService,
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

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_RUN,
    async (event, input: RunAnalysisInput): Promise<IPCResult<Analysis>> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const onProgress = (progress: { analysisId: string; stage: string; message: string }): void => {
        if (window && !window.isDestroyed()) {
          window.webContents.send('analysis:progress', progress);
        }
      };

      const result = await analysisService.runAnalysis(input, onProgress);
      if (result.ok) return toIpcResult(result.value);
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_PREVIEW_PAYLOAD,
    async (
      _event,
      profileIds: string[],
      jiraProjectKeys: string[],
      role: string,
      contextWindow: number,
    ): Promise<IPCResult<{ systemPrompt: string; userPrompt: string; tokenEstimate: number }>> => {
      const result = await analysisService.getPayloadPreview(
        profileIds,
        jiraProjectKeys,
        role as Analysis['role'],
        contextWindow,
      );
      if (result.ok) return toIpcResult(result.value);
      return toIpcError(result.error);
    },
  );
}
