import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import type { IPCResult } from '../../domain/types';
import type { ExportService } from '../../services/export.service';
import type { DiagramExportService } from '../../services/diagram-export.service';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerExportHandlers(
  exportService: ExportService,
  diagramExportService?: DiagramExportService,
): void {
  ipcMain.handle(
    IPC_CHANNELS.EXPORT_MARKDOWN,
    async (_event, analysisId: string): Promise<IPCResult<string>> => {
      const result = await exportService.exportMarkdown(analysisId);
      if (result.ok) return toIpcResult(result.value);
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_CSV,
    async (_event, analysisId: string): Promise<IPCResult<string>> => {
      const result = await exportService.exportCSV(analysisId);
      if (result.ok) return toIpcResult(result.value);
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_PDF,
    async (_event, analysisId: string): Promise<IPCResult<string>> => {
      const result = await exportService.exportPDF(analysisId);
      if (result.ok) return toIpcResult(result.value.toString('base64'));
      return toIpcError(result.error);
    },
  );

  if (diagramExportService) {
    ipcMain.handle(
      IPC_CHANNELS.EXPORT_DIAGRAM_PNG,
      async (
        _event,
        base64Data: string,
        relativePath: string,
      ): Promise<IPCResult<string>> => {
        const result = await diagramExportService.savePng(base64Data, relativePath);
        if (result.ok) return toIpcResult(result.value);
        return toIpcError(result.error);
      },
    );
  }
}
