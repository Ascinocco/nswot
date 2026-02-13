import { app, shell, BrowserWindow, session, Menu } from 'electron';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { is } from '@electron-toolkit/utils';
import { registerIpcHandlers } from './ipc/registry';
import { initializeDatabase } from './infrastructure/database';
import { createSecureStorage } from './infrastructure/safe-storage';
import { PreferencesRepository } from './repositories/preferences.repository';
import { WorkspaceRepository } from './repositories/workspace.repository';
import { ProfileRepository } from './repositories/profile.repository';
import { AnalysisRepository } from './repositories/analysis.repository';
import { ChatRepository } from './repositories/chat.repository';
import { ChatActionRepository } from './repositories/chat-action.repository';
import { ActionExecutor } from './providers/actions/action-executor';
import { OpenRouterProvider } from './providers/llm/openrouter.provider';
import { createLlmProvider } from './providers/llm/llm-provider-factory';
import { CircuitBreaker } from './infrastructure/circuit-breaker';
import { SettingsService } from './services/settings.service';
import { WorkspaceService } from './services/workspace.service';
import { FileService } from './services/file.service';
import { ProfileService } from './services/profile.service';
import { ChatService } from './services/chat.service';
import { ExportService } from './services/export.service';
import { IntegrationRepository } from './repositories/integration.repository';
import { IntegrationCacheRepository } from './repositories/integration-cache.repository';
import { JiraProvider } from './providers/jira/jira.provider';
import { IntegrationService } from './services/integration.service';
import { AnalysisService } from './services/analysis.service';
import { ConfluenceProvider } from './providers/confluence/confluence.provider';
import { ConfluenceService } from './services/confluence.service';
import { GitHubProvider } from './providers/github/github.provider';
import { GitHubService } from './services/github.service';
import { CodebaseProvider } from './providers/codebase/codebase.provider';
import { CodebaseService } from './services/codebase.service';
import { ComparisonService } from './services/comparison.service';
import { ThemeRepository } from './repositories/theme.repository';
import { ConversationRepository } from './repositories/conversation.repository';
import { ApprovalMemoryRepository } from './repositories/approval-memory.repository';
import { ConversationService } from './services/conversation.service';
import { ApprovalMemoryService } from './services/approval-memory.service';
import { AgentService } from './services/agent.service';
import { ToolRegistry } from './providers/agent-tools/tool-registry';
import { ToolExecutorRouter } from './providers/agent-tools/tool-executor-router';
import { RenderExecutor } from './providers/agent-tools/render-executor';
import { ReadExecutor } from './providers/agent-tools/read-executor';
import { WriteExecutor } from './providers/agent-tools/write-executor';
import { RENDER_TOOLS } from './providers/agent-tools/render-tools';
import { READ_TOOLS } from './providers/agent-tools/read-tools';
import { WRITE_TOOLS } from './providers/agent-tools/write-tools';
import { Logger } from './infrastructure/logger';
import { FileWatcher } from './infrastructure/file-watcher';
import type { FileChangeEvent } from './infrastructure/file-watcher';
import { IPC_CHANNELS } from './ipc/channels';

const NSWOT_DIR = join(homedir(), '.nswot');

function bootstrapAppDirs(): void {
  const logsDir = join(NSWOT_DIR, 'logs');
  mkdirSync(NSWOT_DIR, { recursive: true });
  mkdirSync(logsDir, { recursive: true });
}

function buildAppMenu(mainWindow: BrowserWindow): Menu {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Settings...',
                accelerator: 'CmdOrCtrl+,',
                click: (): void => {
                  mainWindow.webContents.send(IPC_CHANNELS.MENU_NAVIGATE, '/settings');
                },
              },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(is.dev ? [{ role: 'toggleDevTools' as const }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Learn More',
          click: (): void => {
            shell.openExternal('https://github.com/anthropics/nswot');
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  Menu.setApplicationMenu(buildAppMenu(mainWindow));

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Set CSP headers
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = is.dev
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:*; img-src 'self' data:; font-src 'self' data:"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

bootstrapAppDirs();

// Initialize logger
Logger.initialize({
  level: is.dev ? 'debug' : 'info',
  logDir: join(NSWOT_DIR, 'logs'),
  maxAgeDays: 7,
  consoleEnabled: true,
});
const logger = Logger.getInstance();
logger.info('nswot starting', { version: app.getVersion(), dev: is.dev });

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason);
});

// Initialize database
const db = initializeDatabase(join(NSWOT_DIR, 'nswot.db'));

// Repositories
const preferencesRepo = new PreferencesRepository(db);
const workspaceRepo = new WorkspaceRepository(db);
const profileRepo = new ProfileRepository(db);
const analysisRepo = new AnalysisRepository(db);
const chatRepo = new ChatRepository(db);
const integrationRepo = new IntegrationRepository(db);
const integrationCacheRepo = new IntegrationCacheRepository(db);

// Providers & infrastructure
const openRouterProvider = new OpenRouterProvider();
const llmProviderTypePref = preferencesRepo.getSync('llmProviderType');
const llmProvider = createLlmProvider(
  llmProviderTypePref?.value === 'anthropic' ? 'anthropic' : 'openrouter',
);
const jiraProvider = new JiraProvider();
const confluenceProvider = new ConfluenceProvider();
const githubProvider = new GitHubProvider();
const codebaseProvider = new CodebaseProvider();

const llmCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  cooldownMs: 60_000,
  monitorWindowMs: 120_000,
});
const jiraCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  cooldownMs: 60_000,
  monitorWindowMs: 120_000,
});
const confluenceCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  cooldownMs: 60_000,
  monitorWindowMs: 120_000,
});
const githubCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  cooldownMs: 60_000,
  monitorWindowMs: 120_000,
});

// Secure storage
const secureStorage = createSecureStorage(join(NSWOT_DIR, 'keystore'));

// Services
const settingsService = new SettingsService(
  preferencesRepo,
  secureStorage,
  openRouterProvider,
  llmCircuitBreaker,
);
const workspaceService = new WorkspaceService(workspaceRepo, preferencesRepo);
const fileService = new FileService(workspaceService);
const profileService = new ProfileService(profileRepo, workspaceService);
const chatActionRepo = new ChatActionRepository(db);
const themeRepo = new ThemeRepository(db);
const actionExecutor = new ActionExecutor();
const chatService = new ChatService(chatRepo, analysisRepo, settingsService, chatActionRepo, actionExecutor, llmProvider);
const exportService = new ExportService(analysisRepo);
const integrationService = new IntegrationService(
  integrationRepo,
  integrationCacheRepo,
  workspaceService,
  jiraProvider,
  jiraCircuitBreaker,
  secureStorage,
  preferencesRepo,
);
const confluenceService = new ConfluenceService(
  integrationRepo,
  integrationCacheRepo,
  workspaceService,
  confluenceProvider,
  confluenceCircuitBreaker,
  secureStorage,
);
const githubService = new GitHubService(
  integrationRepo,
  integrationCacheRepo,
  workspaceService,
  githubProvider,
  githubCircuitBreaker,
  secureStorage,
);
const codebaseService = new CodebaseService(
  integrationRepo,
  integrationCacheRepo,
  workspaceService,
  codebaseProvider,
  secureStorage,
);
const analysisService = new AnalysisService(
  analysisRepo,
  profileRepo,
  integrationRepo,
  integrationCacheRepo,
  settingsService,
  workspaceService,
  llmProvider,
);
const comparisonService = new ComparisonService(analysisRepo);

// Phase 4: Conversations, approval memory, agent harness
const conversationRepo = new ConversationRepository(db);
const approvalMemoryRepo = new ApprovalMemoryRepository(db);
const conversationService = new ConversationService(conversationRepo, workspaceService, analysisRepo);
const approvalMemoryService = new ApprovalMemoryService(approvalMemoryRepo);

const toolRegistry = new ToolRegistry();
toolRegistry.registerAll(RENDER_TOOLS, 'render');
toolRegistry.registerAll(READ_TOOLS, 'read');
toolRegistry.registerAll(WRITE_TOOLS, 'write');

const renderExecutor = new RenderExecutor(comparisonService);
const readExecutor = new ReadExecutor(
  integrationRepo,
  integrationCacheRepo,
  profileRepo,
  workspaceService,
);
const writeExecutor = new WriteExecutor(fileService, actionExecutor);
const toolExecutorRouter = new ToolExecutorRouter(renderExecutor, readExecutor, writeExecutor);
const agentService = new AgentService(llmProvider, toolRegistry, toolExecutorRouter);

// File watcher
const fileWatcher = new FileWatcher();
fileWatcher.on('change', (event: FileChangeEvent) => {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.FILE_CHANGED, event);
    }
  }
});
fileWatcher.on('error', (error: unknown) => {
  logger.warn('File watcher error', { error: String(error) });
});

// Recovery: mark stale running analyses as failed
analysisRepo.recoverRunning();

// IPC
registerIpcHandlers({
  settingsService,
  workspaceService,
  fileService,
  profileService,
  analysisRepo,
  analysisService,
  chatService,
  exportService,
  integrationService,
  confluenceService,
  githubService,
  codebaseService,
  comparisonService,
  themeRepo,
  agentService,
  conversationService,
  approvalMemoryService,
  chatRepo,
  onWorkspaceOpen: (path: string) => {
    logger.info('Starting file watcher', { path });
    fileWatcher.start(path);
  },
});

app.whenReady().then(() => {
  logger.info('App ready, creating window');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  logger.info('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
