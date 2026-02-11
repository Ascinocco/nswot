export const IPC_CHANNELS = {
  SYSTEM_PING: 'system:ping',

  // Workspace
  WORKSPACE_OPEN: 'workspace:open',
  WORKSPACE_GET_CURRENT: 'workspace:getCurrent',

  // Profiles
  PROFILE_LIST: 'profile:list',
  PROFILE_GET: 'profile:get',
  PROFILE_CREATE: 'profile:create',
  PROFILE_UPDATE: 'profile:update',
  PROFILE_DELETE: 'profile:delete',
  PROFILE_IMPORT: 'profile:import',

  // Integrations
  INTEGRATION_GET: 'integration:get',
  INTEGRATION_CONNECT_JIRA: 'integration:connectJira',
  INTEGRATION_DISCONNECT: 'integration:disconnect',
  INTEGRATION_SYNC: 'integration:sync',

  // Analysis
  ANALYSIS_RUN: 'analysis:run',
  ANALYSIS_GET: 'analysis:get',
  ANALYSIS_LIST: 'analysis:list',
  ANALYSIS_DELETE: 'analysis:delete',

  // Chat
  CHAT_SEND: 'chat:send',
  CHAT_HISTORY: 'chat:history',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_API_KEY: 'settings:getApiKey',
  SETTINGS_SET_API_KEY: 'settings:setApiKey',

  // LLM
  LLM_LIST_MODELS: 'llm:listModels',

  // Export
  EXPORT_MARKDOWN: 'export:markdown',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
