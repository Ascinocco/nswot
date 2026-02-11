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
  workspace: {
    open: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_OPEN),
    getCurrent: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_CURRENT),
  },
  file: {
    readDir: (relativePath) => ipcRenderer.invoke(IPC_CHANNELS.FILE_READ_DIR, relativePath),
    read: (relativePath) => ipcRenderer.invoke(IPC_CHANNELS.FILE_READ, relativePath),
    write: (relativePath, content) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_WRITE, relativePath, content),
  },
  profiles: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_LIST),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_CREATE, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_UPDATE, id, input),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_DELETE, id),
    importMarkdown: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_IMPORT, filePath),
  },
};

contextBridge.exposeInMainWorld('nswot', api);
