import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { match } from '../../domain/result';
import type { FileService } from '../../services/file.service';
import type { IPCResult } from '../../domain/types';
import type { FileEntry } from '../../infrastructure/file-system';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerFileHandlers(fileService: FileService): void {
  ipcMain.handle(
    IPC_CHANNELS.FILE_READ_DIR,
    async (_event, relativePath: string): Promise<IPCResult<FileEntry[]>> => {
      const result = await fileService.listDirectory(relativePath);
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE_READ,
    async (_event, relativePath: string): Promise<IPCResult<string>> => {
      const result = await fileService.readFile(relativePath);
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE_WRITE,
    async (_event, relativePath: string, content: string): Promise<IPCResult<void>> => {
      const result = await fileService.writeFile(relativePath, content);
      return match(result, {
        ok: () => toIpcResult<void>(undefined),
        err: (error) => toIpcError(error),
      });
    },
  );
}
