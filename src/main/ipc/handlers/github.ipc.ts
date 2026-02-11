import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { match } from '../../domain/result';
import type { GitHubService } from '../../services/github.service';
import type { IPCResult } from '../../domain/types';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerGitHubHandlers(githubService: GitHubService): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_GET,
    async (): Promise<IPCResult<unknown>> => {
      const result = await githubService.getIntegration();
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.GITHUB_CONNECT,
    async (_event, pat: string): Promise<IPCResult<unknown>> => {
      const result = await githubService.connect(pat);
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.GITHUB_DISCONNECT,
    async (): Promise<IPCResult<void>> => {
      const result = await githubService.disconnect();
      return match(result, {
        ok: () => toIpcResult<void>(undefined),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.GITHUB_LIST_REPOS,
    async (): Promise<IPCResult<unknown>> => {
      const result = await githubService.listRepos();
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.GITHUB_SYNC,
    async (_event, repos: string[]): Promise<IPCResult<unknown>> => {
      const result = await githubService.sync(repos);
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );
}
