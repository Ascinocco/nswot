import { ipcMain } from 'electron';
import { IPC_CHANNELS } from './channels';
import type { IPCResult } from '../domain/types';

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SYSTEM_PING, (): IPCResult<string> => {
    return { success: true, data: 'pong' };
  });
}
