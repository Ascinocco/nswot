import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { match } from '../../domain/result';
import type { SettingsService } from '../../services/settings.service';
import type { IPCResult } from '../../domain/types';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerSettingsHandlers(settingsService: SettingsService): void {
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET,
    async (): Promise<IPCResult<Record<string, string>>> => {
      const result = await settingsService.getAllPreferences();
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    async (_event, key: string, value: string): Promise<IPCResult<void>> => {
      const result = await settingsService.setPreference(key, value);
      return match(result, {
        ok: () => toIpcResult<void>(undefined),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_API_KEY,
    async (): Promise<IPCResult<{ isSet: boolean }>> => {
      const result = await settingsService.getApiKeyStatus();
      return match(result, {
        ok: (data) => toIpcResult(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET_API_KEY,
    async (_event, apiKey: string, providerType?: string): Promise<IPCResult<void>> => {
      const result = await settingsService.setApiKey(apiKey, providerType);
      return match(result, {
        ok: () => toIpcResult<void>(undefined),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.LLM_LIST_MODELS,
    async (): Promise<IPCResult<unknown[]>> => {
      const result = await settingsService.listModels();
      return match(result, {
        ok: (data) => toIpcResult<unknown[]>(data),
        err: (error) => toIpcError(error),
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.LLM_GET_PROVIDER,
    (): IPCResult<string> => {
      return toIpcResult(settingsService.getLlmProviderType());
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.LLM_SET_PROVIDER,
    async (_event, type: string): Promise<IPCResult<void>> => {
      const result = await settingsService.setPreference('llmProviderType', type);
      return match(result, {
        ok: () => toIpcResult<void>(undefined),
        err: (error) => toIpcError(error),
      });
    },
  );
}
