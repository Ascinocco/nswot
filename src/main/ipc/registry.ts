import { ipcMain } from 'electron';
import { IPC_CHANNELS } from './channels';
import { registerSettingsHandlers } from './handlers/settings.ipc';
import { registerWorkspaceHandlers } from './handlers/workspace.ipc';
import { registerFileHandlers } from './handlers/file.ipc';
import { registerProfileHandlers } from './handlers/profile.ipc';
import type { SettingsService } from '../services/settings.service';
import type { WorkspaceService } from '../services/workspace.service';
import type { FileService } from '../services/file.service';
import type { ProfileService } from '../services/profile.service';
import type { IPCResult } from '../domain/types';

export interface IpcContext {
  settingsService: SettingsService;
  workspaceService: WorkspaceService;
  fileService: FileService;
  profileService: ProfileService;
}

export function registerIpcHandlers(context: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.SYSTEM_PING, (): IPCResult<string> => {
    return { success: true, data: 'pong' };
  });

  registerSettingsHandlers(context.settingsService);
  registerWorkspaceHandlers(context.workspaceService);
  registerFileHandlers(context.fileService);
  registerProfileHandlers(context.profileService);
}
