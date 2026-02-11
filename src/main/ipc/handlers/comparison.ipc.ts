import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import type { IPCResult } from '../../domain/types';
import type { ComparisonResult, ComparisonAnalysisSummary } from '../../domain/comparison.types';
import type { ComparisonService } from '../../services/comparison.service';
import type { AnalysisRepository } from '../../repositories/analysis.repository';
import type { WorkspaceService } from '../../services/workspace.service';
import { DomainError, ERROR_CODES } from '../../domain/errors';
import { match } from '../../domain/result';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerComparisonHandlers(
  comparisonService: ComparisonService,
  analysisRepo: AnalysisRepository,
  workspaceService: WorkspaceService,
): void {
  ipcMain.handle(
    IPC_CHANNELS.COMPARISON_LIST,
    async (): Promise<IPCResult<ComparisonAnalysisSummary[]>> => {
      const workspaceId = workspaceService.getCurrentId();
      if (!workspaceId) {
        return toIpcError(
          new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'),
        );
      }
      try {
        const analyses = await analysisRepo.findForComparison(workspaceId);
        return toIpcResult(analyses);
      } catch {
        return toIpcError(
          new DomainError(ERROR_CODES.DB_ERROR, 'Failed to list analyses for comparison'),
        );
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.COMPARISON_RUN,
    async (
      _event,
      analysisIdA: string,
      analysisIdB: string,
    ): Promise<IPCResult<ComparisonResult>> => {
      const result = await comparisonService.compare(analysisIdA, analysisIdB);
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError<ComparisonResult>(error),
      });
    },
  );
}
