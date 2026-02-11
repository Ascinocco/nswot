import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../main/ipc/channels';
import type { NswotAPI } from './api';

const api: NswotAPI = {
  system: {
    ping: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_PING),
  },
  settings: {
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    set: (key, value) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value),
    getApiKeyStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_API_KEY),
    setApiKey: (apiKey) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_API_KEY, apiKey),
  },
  llm: {
    listModels: () => ipcRenderer.invoke(IPC_CHANNELS.LLM_LIST_MODELS),
  },
};

contextBridge.exposeInMainWorld('nswot', api);
