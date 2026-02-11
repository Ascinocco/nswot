import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import type { IPCResult } from '../../domain/types';
import type { ExportService } from '../../services/export.service';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerExportHandlers(exportService: ExportService): void {
  ipcMain.handle(
    IPC_CHANNELS.EXPORT_MARKDOWN,
    async (_event, analysisId: string): Promise<IPCResult<string>> => {
      const result = await exportService.exportMarkdown(analysisId);
      if (result.ok) return toIpcResult(result.value);
      return toIpcError(result.error);
    },
  );
}
