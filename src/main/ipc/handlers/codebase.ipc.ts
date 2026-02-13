import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { match } from '../../domain/result';
import type { CodebaseService, CodebaseProgress } from '../../services/codebase.service';
import type { IPCResult } from '../../domain/types';
import type { CodebaseAnalysisOptions } from '../../providers/codebase/codebase.types';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerCodebaseHandlers(codebaseService: CodebaseService): void {
  ipcMain.handle(
    IPC_CHANNELS.CODEBASE_CHECK_PREREQUISITES,
    async (): Promise<IPCResult<unknown>> => {
      const result = await codebaseService.checkPrerequisites();
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CODEBASE_ANALYZE,
    async (
      event,
      repos: string[],
      options: Partial<CodebaseAnalysisOptions>,
      jiraProjectKeys: string[],
    ): Promise<IPCResult<unknown>> => {
      const window = BrowserWindow.fromWebContents(event.sender);

      const onProgress = (progress: CodebaseProgress): void => {
        if (window && !window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.CODEBASE_PROGRESS, progress);
        }
      };

      const result = await codebaseService.analyzeRepos(
        repos,
        options,
        jiraProjectKeys,
        onProgress,
      );
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CODEBASE_GET_CACHED,
    async (_event, repo: string): Promise<IPCResult<unknown>> => {
      const result = await codebaseService.getCachedAnalysis(repo);
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CODEBASE_CLEAR_REPOS,
    async (): Promise<IPCResult<unknown>> => {
      const result = await codebaseService.clearClonedRepos();
      return match(result, {
        ok: () => toIpcResult(undefined),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CODEBASE_LIST_CACHED,
    async (): Promise<IPCResult<unknown>> => {
      const result = await codebaseService.listCachedAnalyses();
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CODEBASE_STORAGE_SIZE,
    async (): Promise<IPCResult<unknown>> => {
      const result = await codebaseService.getStorageSize();
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );
}
