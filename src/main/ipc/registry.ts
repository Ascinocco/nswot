import { ipcMain } from 'electron';
import { IPC_CHANNELS } from './channels';
import { registerSettingsHandlers } from './handlers/settings.ipc';
import { registerWorkspaceHandlers } from './handlers/workspace.ipc';
import { registerFileHandlers } from './handlers/file.ipc';
import { registerProfileHandlers } from './handlers/profile.ipc';
import { registerAnalysisHandlers } from './handlers/analysis.ipc';
import { registerChatHandlers } from './handlers/chat.ipc';
import { registerExportHandlers } from './handlers/export.ipc';
import { registerIntegrationHandlers } from './handlers/integration.ipc';
import { registerConfluenceHandlers } from './handlers/confluence.ipc';
import { registerGitHubHandlers } from './handlers/github.ipc';
import { registerCodebaseHandlers } from './handlers/codebase.ipc';
import type { SettingsService } from '../services/settings.service';
import type { WorkspaceService } from '../services/workspace.service';
import type { FileService } from '../services/file.service';
import type { ProfileService } from '../services/profile.service';
import type { AnalysisRepository } from '../repositories/analysis.repository';
import type { AnalysisService } from '../services/analysis.service';
import type { ChatService } from '../services/chat.service';
import type { ExportService } from '../services/export.service';
import type { IntegrationService } from '../services/integration.service';
import type { ConfluenceService } from '../services/confluence.service';
import type { GitHubService } from '../services/github.service';
import type { CodebaseService } from '../services/codebase.service';
import type { IPCResult } from '../domain/types';

export interface IpcContext {
  settingsService: SettingsService;
  workspaceService: WorkspaceService;
  fileService: FileService;
  profileService: ProfileService;
  analysisRepo: AnalysisRepository;
  analysisService: AnalysisService;
  chatService: ChatService;
  exportService: ExportService;
  integrationService: IntegrationService;
  confluenceService?: ConfluenceService;
  githubService?: GitHubService;
  codebaseService?: CodebaseService;
}

export function registerIpcHandlers(context: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.SYSTEM_PING, (): IPCResult<string> => {
    return { success: true, data: 'pong' };
  });

  registerSettingsHandlers(context.settingsService);
  registerWorkspaceHandlers(context.workspaceService);
  registerFileHandlers(context.fileService);
  registerProfileHandlers(context.profileService);
  registerAnalysisHandlers(context.analysisRepo, context.analysisService, context.workspaceService);
  registerChatHandlers(context.chatService);
  registerExportHandlers(context.exportService);
  registerIntegrationHandlers(context.integrationService);
  if (context.confluenceService) registerConfluenceHandlers(context.confluenceService);
  if (context.githubService) registerGitHubHandlers(context.githubService);
  if (context.codebaseService) registerCodebaseHandlers(context.codebaseService);
}
