import { ipcMain } from 'electron';
import { IPC_CHANNELS } from './channels';
import { registerSettingsHandlers } from './handlers/settings.ipc';
import type { SettingsService } from '../services/settings.service';
import type { IPCResult } from '../domain/types';

export interface IpcContext {
  settingsService: SettingsService;
}

export function registerIpcHandlers(context: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.SYSTEM_PING, (): IPCResult<string> => {
    return { success: true, data: 'pong' };
  });

  registerSettingsHandlers(context.settingsService);
}
