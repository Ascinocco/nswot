import { app, shell, BrowserWindow, session } from 'electron';
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

const NSWOT_DIR = join(homedir(), '.nswot');

function bootstrapAppDirs(): void {
  const logsDir = join(NSWOT_DIR, 'logs');
  mkdirSync(NSWOT_DIR, { recursive: true });
  mkdirSync(logsDir, { recursive: true });
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

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
const chatService = new ChatService(chatRepo, analysisRepo, settingsService, chatActionRepo, actionExecutor);
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
);
const comparisonService = new ComparisonService(analysisRepo);

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
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
