import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { ERROR_CODES } from '../../domain/errors';
import type { IPCResult, Theme } from '../../domain/types';
import type { ThemeRepository } from '../../repositories/theme.repository';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(code: string, message: string): IPCResult<T> {
  return { success: false, error: { code, message } };
}

export function registerThemeHandlers(themeRepo: ThemeRepository): void {
  ipcMain.handle(
    IPC_CHANNELS.THEME_LIST,
    async (_event, analysisId: string): Promise<IPCResult<Theme[]>> => {
      try {
        const themes = await themeRepo.findByAnalysis(analysisId);
        return toIpcResult(themes);
      } catch {
        return toIpcError(ERROR_CODES.DB_ERROR, 'Failed to list themes');
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.THEME_GET,
    async (_event, id: string): Promise<IPCResult<Theme | null>> => {
      try {
        const theme = await themeRepo.findById(id);
        return toIpcResult(theme);
      } catch {
        return toIpcError(ERROR_CODES.DB_ERROR, 'Failed to get theme');
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.THEME_UPDATE,
    async (_event, id: string, fields: { label?: string; description?: string }): Promise<IPCResult<Theme | null>> => {
      try {
        const updated = await themeRepo.update(id, fields);
        if (!updated) {
          return toIpcError(ERROR_CODES.NOT_FOUND, `Theme ${id} not found`);
        }
        return toIpcResult(updated);
      } catch {
        return toIpcError(ERROR_CODES.DB_ERROR, 'Failed to update theme');
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.THEME_DELETE,
    async (_event, id: string): Promise<IPCResult<void>> => {
      try {
        await themeRepo.deleteById(id);
        return toIpcResult<void>(undefined);
      } catch {
        return toIpcError(ERROR_CODES.DB_ERROR, 'Failed to delete theme');
      }
    },
  );
}
