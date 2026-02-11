import { spawn } from 'child_process';
import type { ActionResult, ActionToolName } from '../../domain/types';
import type { ActionExecutorOptions } from './action.types';
import { DEFAULT_ACTION_OPTIONS } from './action.types';

export class ActionExecutor {
  private readonly options: ActionExecutorOptions;

  constructor(options?: Partial<ActionExecutorOptions>) {
    this.options = { ...DEFAULT_ACTION_OPTIONS, ...options };
  }

  async execute(
    toolName: ActionToolName,
    toolInput: Record<string, unknown>,
  ): Promise<ActionResult> {
    const prompt = this.buildPrompt(toolName, toolInput);
    const allowedTools = this.getAllowedTools(toolName);

    const args = [
      '--print',
      '--output-format',
      'json',
      '--allowedTools',
      allowedTools,
      '--model',
      this.options.model,
      '--max-turns',
      String(this.options.maxTurns),
      '-p',
      prompt,
    ];

    const { stdout, stderr, exitCode } = await this.spawnWithTimeout(
      'claude',
      args,
      undefined,
      this.options.timeoutMs,
    );

    if (exitCode !== 0) {
      const errorMsg = stderr.trim() || `Claude CLI exited with code ${exitCode}`;
      return { success: false, error: errorMsg };
    }

    return this.parseOutput(stdout);
  }

  buildPrompt(toolName: ActionToolName, toolInput: Record<string, unknown>): string {
    const details = Object.entries(toolInput)
      .map(([key, value]) => {
        const formatted =
          Array.isArray(value) ? JSON.stringify(value) : String(value);
        return `- ${key}: ${formatted}`;
      })
      .join('\n');

    return [
      'Execute the following action using the available MCP tools. Do not modify the content.',
      'Return the result as JSON with the fields: success (boolean), id (created resource ID), url (link to created resource), error (if failed).',
      '',
      `ACTION: ${toolName}`,
      'DETAILS:',
      details,
      '',
      'Execute this now.',
    ].join('\n');
  }

  parseOutput(rawOutput: string): ActionResult {
    let textContent: string;

    try {
      const envelope = JSON.parse(rawOutput) as { result?: string; content?: string };
      textContent = envelope.result ?? envelope.content ?? rawOutput;
    } catch {
      textContent = rawOutput;
    }

    const fenceMatch = textContent.match(/```json\s*([\s\S]*?)```/);
    const jsonStr = fenceMatch ? fenceMatch[1]!.trim() : textContent.trim();

    try {
      const result = JSON.parse(jsonStr) as ActionResult;
      return {
        success: result.success ?? false,
        id: result.id,
        url: result.url,
        error: result.error,
      };
    } catch {
      return { success: false, error: `Failed to parse action result: ${jsonStr.slice(0, 200)}` };
    }
  }

  private getAllowedTools(toolName: ActionToolName): string {
    if (toolName.startsWith('create_jira') || toolName === 'add_jira_comment') {
      return 'mcp__jira__*';
    }
    if (toolName === 'create_confluence_page') {
      return 'mcp__confluence__*';
    }
    if (toolName.startsWith('create_github')) {
      return 'mcp__github__*';
    }
    return 'mcp__jira__*,mcp__confluence__*,mcp__github__*';
  }

  private spawnWithTimeout(
    command: string,
    args: string[],
    cwd: string | undefined,
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const child = spawn(command, args, {
        cwd,
        signal: controller.signal,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          reject(new Error(`Action execution timed out after ${timeoutMs}ms`));
        } else {
          reject(err);
        }
      });
    });
  }
}
