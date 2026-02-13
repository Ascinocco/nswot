import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../channels';
import type { IPCResult, Analysis } from '../../domain/types';
import type { AnalysisRepository } from '../../repositories/analysis.repository';
import type { ChatRepository } from '../../repositories/chat.repository';
import type { AnalysisService, RunAnalysisInput } from '../../services/analysis.service';
import type { WorkspaceService } from '../../services/workspace.service';
import { DomainError, ERROR_CODES } from '../../domain/errors';
import { generateBlockId } from '../../services/agent.service';

function toIpcResult<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

function toIpcError<T>(error: { code: string; message: string }): IPCResult<T> {
  return { success: false, error: { code: error.code, message: error.message } };
}

export function registerAnalysisHandlers(
  analysisRepo: AnalysisRepository,
  analysisService: AnalysisService,
  workspaceService: WorkspaceService,
  chatRepo?: ChatRepository,
): void {
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_LIST,
    async (): Promise<IPCResult<Analysis[]>> => {
      const workspaceId = workspaceService.getCurrentId();
      if (!workspaceId) {
        return toIpcError(
          new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'),
        );
      }
      try {
        const analyses = await analysisRepo.findByWorkspace(workspaceId);
        return toIpcResult(analyses);
      } catch (cause) {
        return toIpcError(
          new DomainError(ERROR_CODES.DB_ERROR, 'Failed to list analyses'),
        );
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_GET,
    async (_event, id: string): Promise<IPCResult<Analysis>> => {
      try {
        const analysis = await analysisRepo.findById(id);
        if (!analysis) {
          return toIpcError(
            new DomainError(ERROR_CODES.INTERNAL_ERROR, `Analysis "${id}" not found`),
          );
        }
        return toIpcResult(analysis);
      } catch (cause) {
        return toIpcError(
          new DomainError(ERROR_CODES.DB_ERROR, 'Failed to get analysis'),
        );
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_DELETE,
    async (_event, id: string): Promise<IPCResult<void>> => {
      try {
        const analysis = await analysisRepo.findById(id);
        if (!analysis) {
          return toIpcError(
            new DomainError(ERROR_CODES.INTERNAL_ERROR, `Analysis "${id}" not found`),
          );
        }
        await analysisRepo.delete(id);
        return toIpcResult<void>(undefined);
      } catch (cause) {
        return toIpcError(
          new DomainError(ERROR_CODES.DB_ERROR, 'Failed to delete analysis'),
        );
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_RUN,
    async (event, input: RunAnalysisInput): Promise<IPCResult<Analysis>> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const onProgress = (progress: { analysisId: string; stage: string; message: string }): void => {
        if (window && !window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.ANALYSIS_PROGRESS, progress);
        }
      };

      const result = await analysisService.runAnalysis(input, onProgress);
      if (result.ok) {
        // Create initial chat message with analysis results as content blocks
        if (chatRepo && result.value.swotOutput) {
          const blocks: Array<{ type: string; id: string; data: unknown }> = [];
          blocks.push({
            type: 'swot_analysis',
            id: generateBlockId(),
            data: result.value.swotOutput,
          });
          if (result.value.summariesOutput) {
            blocks.push({
              type: 'summary_cards',
              id: generateBlockId(),
              data: result.value.summariesOutput,
            });
          }
          if (result.value.qualityMetrics) {
            blocks.push({
              type: 'quality_metrics',
              id: generateBlockId(),
              data: result.value.qualityMetrics,
            });
          }
          await chatRepo.insert(
            result.value.id,
            'assistant',
            JSON.stringify(blocks),
            'blocks',
          );
        }
        return toIpcResult(result.value);
      }
      return toIpcError(result.error);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_GET_PSEUDONYM_MAP,
    async (_event, id: string): Promise<IPCResult<Record<string, string>>> => {
      try {
        const analysis = await analysisRepo.findById(id);
        if (!analysis) {
          return toIpcError(
            new DomainError(ERROR_CODES.INTERNAL_ERROR, `Analysis "${id}" not found`),
          );
        }
        const pseudonymMap = analysis.inputSnapshot?.pseudonymMap ?? {};
        return toIpcResult(pseudonymMap);
      } catch (cause) {
        return toIpcError(
          new DomainError(ERROR_CODES.DB_ERROR, 'Failed to get pseudonym map'),
        );
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_FIND_BY_CONVERSATION,
    async (_event, conversationId: string): Promise<IPCResult<Analysis[]>> => {
      try {
        const analyses = await analysisRepo.findByConversation(conversationId);
        return toIpcResult(analyses);
      } catch (cause) {
        return toIpcError(
          new DomainError(ERROR_CODES.DB_ERROR, 'Failed to find analyses by conversation'),
        );
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_PREVIEW_PAYLOAD,
    async (
      _event,
      profileIds: string[],
      jiraProjectKeys: string[],
      confluenceSpaceKeys: string[],
      githubRepos: string[],
      codebaseRepos: string[],
      role: string,
      contextWindow: number,
    ): Promise<IPCResult<{ systemPrompt: string; userPrompt: string; tokenEstimate: number }>> => {
      const result = await analysisService.getPayloadPreview(
        profileIds,
        jiraProjectKeys,
        confluenceSpaceKeys ?? [],
        githubRepos ?? [],
        codebaseRepos ?? [],
        role as Analysis['role'],
        contextWindow,
      );
      if (result.ok) return toIpcResult(result.value);
      return toIpcError(result.error);
    },
  );
}
