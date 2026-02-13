import type { ToolExecutorInterface, ToolExecutionOutput } from '../../services/agent.service';
import type { ToolCategory } from './tool-registry';
import type { RenderExecutor } from './render-executor';
import type { ReadExecutor } from './read-executor';
import type { WriteExecutor } from './write-executor';

/**
 * Routes tool execution calls to the correct executor based on tool category.
 *
 * Sprint 38: render → RenderExecutor
 * Sprint 39: read → ReadExecutor
 * Sprint 40: write → WriteExecutor
 *
 * Implements ToolExecutorInterface so it can be injected into AgentService.
 */
export class ToolExecutorRouter implements ToolExecutorInterface {
  constructor(
    private readonly renderExecutor: RenderExecutor,
    private readonly readExecutor?: ReadExecutor,
    private readonly writeExecutor?: WriteExecutor,
  ) {}

  async execute(
    toolName: string,
    category: ToolCategory,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionOutput> {
    switch (category) {
      case 'render':
        return this.renderExecutor.execute(toolName, input);
      case 'read':
        if (!this.readExecutor) {
          return { content: JSON.stringify({ error: `Read tool '${toolName}' not yet configured` }) };
        }
        return this.readExecutor.execute(toolName, input);
      case 'write':
        if (!this.writeExecutor) {
          return { content: JSON.stringify({ error: `Write tool '${toolName}' not yet configured` }) };
        }
        return this.writeExecutor.execute(toolName, input);
      default:
        return { content: JSON.stringify({ error: `Unknown tool category: ${category}` }) };
    }
  }
}
