import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { match } from '../../domain/result';
import type { ProfileService } from '../../services/profile.service';
import type { IPCResult, Profile, ProfileInput } from '../../domain/types';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerProfileHandlers(profileService: ProfileService): void {
  ipcMain.handle(
    IPC_CHANNELS.PROFILE_LIST,
    async (): Promise<IPCResult<Profile[]>> => {
      const result = await profileService.list();
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_GET,
    async (_event, id: string): Promise<IPCResult<Profile>> => {
      const result = await profileService.get(id);
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_CREATE,
    async (_event, input: ProfileInput): Promise<IPCResult<Profile>> => {
      const result = await profileService.create(input);
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_UPDATE,
    async (_event, id: string, input: ProfileInput): Promise<IPCResult<Profile>> => {
      const result = await profileService.update(id, input);
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_DELETE,
    async (_event, id: string): Promise<IPCResult<void>> => {
      const result = await profileService.delete(id);
      return match(result, {
        ok: () => toIpcResult<void>(undefined),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_IMPORT,
    async (_event, filePath: string): Promise<IPCResult<Profile[]>> => {
      const result = await profileService.importFromMarkdown(filePath);
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );
}
