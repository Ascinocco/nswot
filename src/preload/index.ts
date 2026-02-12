import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../main/ipc/channels';
import type { NswotAPI } from './api';
import type { ChatAction } from '../main/domain/types';

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
    getProvider: () => ipcRenderer.invoke(IPC_CHANNELS.LLM_GET_PROVIDER),
    setProvider: (type) => ipcRenderer.invoke(IPC_CHANNELS.LLM_SET_PROVIDER, type),
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
    onChanged: (callback: (data: { type: string; path: string }) => void) => {
      const handler = (_event: unknown, data: { type: string; path: string }) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.FILE_CHANGED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.FILE_CHANGED, handler);
    },
  },
  profiles: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_LIST),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_CREATE, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_UPDATE, id, input),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_DELETE, id),
    importMarkdown: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_IMPORT, filePath),
    importDirectory: (dirPath) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_IMPORT_DIR, dirPath),
  },
  integrations: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.INTEGRATION_GET),
    connectJira: (clientId, clientSecret) =>
      ipcRenderer.invoke(IPC_CHANNELS.INTEGRATION_CONNECT_JIRA, clientId, clientSecret),
    disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.INTEGRATION_DISCONNECT),
    sync: (projectKeys) => ipcRenderer.invoke(IPC_CHANNELS.INTEGRATION_SYNC, projectKeys),
    listProjects: () => ipcRenderer.invoke(IPC_CHANNELS.INTEGRATION_LIST_PROJECTS),
  },
  confluence: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.CONFLUENCE_GET),
    connect: () => ipcRenderer.invoke(IPC_CHANNELS.CONFLUENCE_CONNECT),
    disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.CONFLUENCE_DISCONNECT),
    listSpaces: () => ipcRenderer.invoke(IPC_CHANNELS.CONFLUENCE_LIST_SPACES),
    sync: (spaceKeys) => ipcRenderer.invoke(IPC_CHANNELS.CONFLUENCE_SYNC, spaceKeys),
  },
  github: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.GITHUB_GET),
    connect: (pat) => ipcRenderer.invoke(IPC_CHANNELS.GITHUB_CONNECT, pat),
    disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.GITHUB_DISCONNECT),
    listRepos: () => ipcRenderer.invoke(IPC_CHANNELS.GITHUB_LIST_REPOS),
    sync: (repos) => ipcRenderer.invoke(IPC_CHANNELS.GITHUB_SYNC, repos),
  },
  codebase: {
    checkPrerequisites: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CODEBASE_CHECK_PREREQUISITES),
    analyze: (
      repos: string[],
      options: Record<string, unknown>,
      jiraProjectKeys: string[],
    ) => ipcRenderer.invoke(IPC_CHANNELS.CODEBASE_ANALYZE, repos, options, jiraProjectKeys),
    getCached: (repo: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CODEBASE_GET_CACHED, repo),
    clearRepos: () => ipcRenderer.invoke(IPC_CHANNELS.CODEBASE_CLEAR_REPOS),
    listCached: () => ipcRenderer.invoke(IPC_CHANNELS.CODEBASE_LIST_CACHED),
    storageSize: () => ipcRenderer.invoke(IPC_CHANNELS.CODEBASE_STORAGE_SIZE),
    onProgress: (callback: (data: { repo: string; stage: 'cloning' | 'analyzing' | 'parsing' | 'done' | 'failed'; message: string }) => void) => {
      const handler = (
        _event: unknown,
        data: { repo: string; stage: 'cloning' | 'analyzing' | 'parsing' | 'done' | 'failed'; message: string },
      ) => callback(data);
      ipcRenderer.on('codebase:progress', handler);
      return () => ipcRenderer.removeListener('codebase:progress', handler);
    },
  },
  analysis: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_LIST),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_GET, id),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_DELETE, id),
    run: (input) => ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_RUN, input),
    getPseudonymMap: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_GET_PSEUDONYM_MAP, id),
    previewPayload: (profileIds, jiraProjectKeys, confluenceSpaceKeys, githubRepos, codebaseRepos, role, contextWindow) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.ANALYSIS_PREVIEW_PAYLOAD,
        profileIds,
        jiraProjectKeys,
        confluenceSpaceKeys,
        githubRepos,
        codebaseRepos,
        role,
        contextWindow,
      ),
    onProgress: (callback) => {
      const handler = (_event: unknown, data: { analysisId: string; stage: string; message: string }) =>
        callback(data);
      ipcRenderer.on('analysis:progress', handler);
      return () => ipcRenderer.removeListener('analysis:progress', handler);
    },
  },
  chat: {
    getMessages: (analysisId) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_GET_MESSAGES, analysisId),
    send: (analysisId, content) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, analysisId, content),
    delete: (analysisId) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_DELETE, analysisId),
    onChunk: (callback) => {
      const handler = (_event: unknown, data: { analysisId: string; chunk: string }) =>
        callback(data);
      ipcRenderer.on('chat:chunk', handler);
      return () => ipcRenderer.removeListener('chat:chunk', handler);
    },
    setEditorContext: (context: { filePath: string | null; contentPreview: string | null; selectedText: string | null } | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SET_EDITOR_CONTEXT, context),
    actions: {
      approve: (actionId: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.CHAT_ACTION_APPROVE, actionId),
      reject: (actionId: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.CHAT_ACTION_REJECT, actionId),
      edit: (actionId: string, editedInput: Record<string, unknown>) =>
        ipcRenderer.invoke(IPC_CHANNELS.CHAT_ACTION_EDIT, actionId, editedInput),
      list: (analysisId: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.CHAT_ACTION_LIST, analysisId),
      onPending: (callback: (action: ChatAction) => void) => {
        const handler = (_event: unknown, action: ChatAction) => callback(action);
        ipcRenderer.on(IPC_CHANNELS.CHAT_ACTION_PENDING, handler);
        return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_ACTION_PENDING, handler);
      },
    },
  },
  comparison: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.COMPARISON_LIST),
    run: (analysisIdA: string, analysisIdB: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.COMPARISON_RUN, analysisIdA, analysisIdB),
  },
  themes: {
    list: (analysisId: string) => ipcRenderer.invoke(IPC_CHANNELS.THEME_LIST, analysisId),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.THEME_GET, id),
    update: (id: string, fields: { label?: string; description?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.THEME_UPDATE, id, fields),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.THEME_DELETE, id),
  },
  export: {
    markdown: (analysisId) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_MARKDOWN, analysisId),
    csv: (analysisId) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_CSV, analysisId),
    pdf: (analysisId) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PDF, analysisId),
  },
  menu: {
    onNavigate: (callback: (path: string) => void) => {
      const handler = (_event: unknown, path: string) => callback(path);
      ipcRenderer.on(IPC_CHANNELS.MENU_NAVIGATE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MENU_NAVIGATE, handler);
    },
  },
};

contextBridge.exposeInMainWorld('nswot', api);
