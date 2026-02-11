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
import { OpenRouterProvider } from './providers/llm/openrouter.provider';
import { CircuitBreaker } from './infrastructure/circuit-breaker';
import { SettingsService } from './services/settings.service';

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
const _workspaceRepo = new WorkspaceRepository(db);

// Providers & infrastructure
const openRouterProvider = new OpenRouterProvider();
const llmCircuitBreaker = new CircuitBreaker({
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

// IPC
registerIpcHandlers({ settingsService });

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
