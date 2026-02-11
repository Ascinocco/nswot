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
  PROFILE_IMPORT_DIR: 'profile:importDir',

  // Integrations — Jira
  INTEGRATION_GET: 'integration:get',
  INTEGRATION_CONNECT_JIRA: 'integration:connectJira',
  INTEGRATION_DISCONNECT: 'integration:disconnect',
  INTEGRATION_SYNC: 'integration:sync',
  INTEGRATION_LIST_PROJECTS: 'integration:listProjects',

  // Integrations — Confluence
  CONFLUENCE_GET: 'confluence:get',
  CONFLUENCE_CONNECT: 'confluence:connect',
  CONFLUENCE_DISCONNECT: 'confluence:disconnect',
  CONFLUENCE_LIST_SPACES: 'confluence:listSpaces',
  CONFLUENCE_SYNC: 'confluence:sync',

  // Integrations — GitHub
  GITHUB_GET: 'github:get',
  GITHUB_CONNECT: 'github:connect',
  GITHUB_DISCONNECT: 'github:disconnect',
  GITHUB_LIST_REPOS: 'github:listRepos',
  GITHUB_SYNC: 'github:sync',

  // Integrations — Codebase Analysis
  CODEBASE_CHECK_PREREQUISITES: 'codebase:checkPrerequisites',
  CODEBASE_ANALYZE: 'codebase:analyze',
  CODEBASE_GET_CACHED: 'codebase:getCached',
  CODEBASE_CLEAR_REPOS: 'codebase:clearRepos',
  CODEBASE_LIST_CACHED: 'codebase:listCached',
  CODEBASE_STORAGE_SIZE: 'codebase:storageSize',

  // Analysis
  ANALYSIS_RUN: 'analysis:run',
  ANALYSIS_GET: 'analysis:get',
  ANALYSIS_LIST: 'analysis:list',
  ANALYSIS_DELETE: 'analysis:delete',
  ANALYSIS_PREVIEW_PAYLOAD: 'analysis:previewPayload',

  // Chat
  CHAT_SEND: 'chat:send',
  CHAT_GET_MESSAGES: 'chat:getMessages',
  CHAT_DELETE: 'chat:delete',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_API_KEY: 'settings:getApiKey',
  SETTINGS_SET_API_KEY: 'settings:setApiKey',

  // LLM
  LLM_LIST_MODELS: 'llm:listModels',

  // Files
  FILE_READ_DIR: 'file:readDir',
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',

  // Export
  EXPORT_MARKDOWN: 'export:markdown',
  EXPORT_CSV: 'export:csv',
  EXPORT_PDF: 'export:pdf',

  // Comparison
  COMPARISON_LIST: 'comparison:list',
  COMPARISON_RUN: 'comparison:run',

  // Themes
  THEME_LIST: 'theme:list',
  THEME_GET: 'theme:get',
  THEME_UPDATE: 'theme:update',
  THEME_DELETE: 'theme:delete',

  // Chat Actions
  CHAT_ACTION_PENDING: 'chat:action:pending',
  CHAT_ACTION_APPROVE: 'chat:action:approve',
  CHAT_ACTION_REJECT: 'chat:action:reject',
  CHAT_ACTION_EDIT: 'chat:action:edit',
  CHAT_ACTION_LIST: 'chat:action:list',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
