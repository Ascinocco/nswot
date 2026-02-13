import type { LLMProvider } from '../llm/llm-provider.interface';
import type { ComparisonService } from '../../services/comparison.service';
import type { IntegrationRepository } from '../../repositories/integration.repository';
import type { IntegrationCacheRepository } from '../../repositories/integration-cache.repository';
import type { ProfileRepository } from '../../repositories/profile.repository';
import type { WorkspaceService } from '../../services/workspace.service';
import type { FileService } from '../../services/file.service';
import type { ActionExecutor } from '../actions/action-executor';
import { AgentService } from '../../services/agent.service';
import { ToolRegistry } from './tool-registry';
import { RenderExecutor } from './render-executor';
import { ReadExecutor } from './read-executor';
import { WriteExecutor } from './write-executor';
import { ToolExecutorRouter } from './tool-executor-router';
import { RENDER_TOOLS } from './render-tools';
import { READ_TOOLS } from './read-tools';
import { WRITE_TOOLS } from './write-tools';

export interface AgentHarnessOptions {
  llmProvider: LLMProvider;
  comparisonService: ComparisonService;
  integrationRepo: IntegrationRepository;
  integrationCacheRepo: IntegrationCacheRepository;
  profileRepo: ProfileRepository;
  workspaceService: WorkspaceService;
  fileService?: FileService;
  actionExecutor?: ActionExecutor;
}

/**
 * Factory function that creates a fully-wired AgentService with:
 * - ToolRegistry populated with render tools (Sprint 38), read tools (Sprint 39), and write tools (Sprint 40)
 * - ToolExecutorRouter dispatching to RenderExecutor, ReadExecutor, and WriteExecutor
 */
export function createAgentHarness(options: AgentHarnessOptions): AgentService {
  const {
    llmProvider,
    comparisonService,
    integrationRepo,
    integrationCacheRepo,
    profileRepo,
    workspaceService,
    fileService,
    actionExecutor,
  } = options;

  // Build tool registry with all tool definitions
  const registry = new ToolRegistry();
  registry.registerAll(RENDER_TOOLS, 'render');
  registry.registerAll(READ_TOOLS, 'read');
  registry.registerAll(WRITE_TOOLS, 'write');

  // Build executor chain
  const renderExecutor = new RenderExecutor(comparisonService);
  const readExecutor = new ReadExecutor(
    integrationRepo,
    integrationCacheRepo,
    profileRepo,
    workspaceService,
  );
  const writeExecutor = new WriteExecutor(fileService, actionExecutor);
  const executorRouter = new ToolExecutorRouter(renderExecutor, readExecutor, writeExecutor);

  return new AgentService(llmProvider, registry, executorRouter);
}
