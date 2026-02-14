import type { ToolExecutionOutput } from '../../services/agent.service';
import type { FileService } from '../../services/file.service';
import type { ActionExecutor } from '../actions/action-executor';
import type { ActionToolName } from '../../domain/types';
import { isFileWriteTool, TOOL_NAMES, FILE_WRITE_TOOL_NAMES } from '../actions/action-tools';

/** Set of Phase 3c action tool names for routing. */
const PHASE3C_TOOL_NAMES = new Set([...TOOL_NAMES, ...FILE_WRITE_TOOL_NAMES]);

/**
 * Executes write tools for the agent harness.
 *
 * - `write_file` (Phase 4): general-purpose file write via FileService
 * - Phase 3c tools (create_jira_issue, etc.): delegated to ActionExecutor
 */
export class WriteExecutor {
  constructor(
    private readonly fileService?: FileService,
    private readonly actionExecutor?: ActionExecutor,
  ) {}

  async execute(
    toolName: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolExecutionOutput> {
    if (toolName === 'write_file') {
      return this.executeWriteFile(input);
    }

    if (PHASE3C_TOOL_NAMES.has(toolName)) {
      return this.executePhase3cTool(toolName as ActionToolName, input, signal);
    }

    return { content: JSON.stringify({ error: `Unknown write tool: ${toolName}` }) };
  }

  private async executeWriteFile(
    input: Record<string, unknown>,
  ): Promise<ToolExecutionOutput> {
    if (!this.fileService) {
      return {
        content: JSON.stringify({ error: 'File service not available. No workspace is open.' }),
      };
    }

    const path = input['path'];
    const content = input['content'];

    if (!path || typeof path !== 'string') {
      return {
        content: JSON.stringify({ error: 'write_file requires a path string' }),
      };
    }
    if (path.includes('..') || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
      return {
        content: JSON.stringify({ error: 'Path traversal not allowed: must be a relative path within the workspace' }),
      };
    }
    if (content === undefined || typeof content !== 'string') {
      return {
        content: JSON.stringify({ error: 'write_file requires a content string' }),
      };
    }

    const result = await this.fileService.writeFile(path, content);
    if (result.ok) {
      return {
        content: JSON.stringify({ success: true, path }),
      };
    }
    return {
      content: JSON.stringify({ error: result.error.message }),
    };
  }

  private async executePhase3cTool(
    toolName: ActionToolName,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolExecutionOutput> {
    if (!this.actionExecutor) {
      return {
        content: JSON.stringify({
          error: `Action executor not available. Cannot execute ${toolName}.`,
        }),
      };
    }

    // File write tools (write_markdown_file, write_csv_file, write_mermaid_file)
    // also go through ActionExecutor which delegates to FileService
    const result = await this.actionExecutor.execute(toolName, input, signal);

    if (result.success) {
      return {
        content: JSON.stringify({
          success: true,
          id: result.id,
          url: result.url,
        }),
      };
    }

    return {
      content: JSON.stringify({ error: result.error ?? 'Action failed' }),
    };
  }
}
