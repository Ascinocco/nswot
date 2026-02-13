import { spawn } from 'child_process';
import type { ActionResult, ActionToolName } from '../../domain/types';
import type { ActionExecutorOptions } from './action.types';
import { DEFAULT_ACTION_OPTIONS } from './action.types';
import { isFileWriteTool } from './action-tools';
import type { FileService } from '../../services/file.service';

export class ActionExecutor {
  private readonly options: ActionExecutorOptions;
  private readonly fileService?: FileService;

  constructor(options?: Partial<ActionExecutorOptions>, fileService?: FileService) {
    this.options = { ...DEFAULT_ACTION_OPTIONS, ...options };
    this.fileService = fileService;
  }

  async execute(
    toolName: ActionToolName,
    toolInput: Record<string, unknown>,
  ): Promise<ActionResult> {
    if (isFileWriteTool(toolName)) {
      return this.executeFileWrite(toolInput);
    }

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

    try {
      const { stdout, stderr, exitCode } = await this.spawnWithTimeout(
        'claude',
        args,
        undefined,
        this.options.timeoutMs,
      );

      if (exitCode !== 0) {
        return { success: false, error: classifyCliError(stderr, exitCode) };
      }

      if (toolName === 'create_jira_issues') {
        return this.parseBatchOutput(stdout);
      }

      return this.parseOutput(stdout);
    } catch (err) {
      if (err instanceof Error) {
        if (isSpawnNotFoundError(err)) {
          return { success: false, error: 'Claude CLI not found. Install it from https://claude.ai/download' };
        }
        if (err.message.includes('timed out')) {
          return { success: false, error: `Action execution timed out after ${this.options.timeoutMs}ms` };
        }
      }
      throw err;
    }
  }

  private async executeFileWrite(toolInput: Record<string, unknown>): Promise<ActionResult> {
    if (!this.fileService) {
      return { success: false, error: 'File service not available. No workspace is open.' };
    }

    const path = toolInput['path'] as string | undefined;
    const content = toolInput['content'] as string | undefined;

    if (!path || typeof path !== 'string') {
      return { success: false, error: 'Missing required field: path' };
    }
    if (path.includes('..')) {
      return { success: false, error: 'Path traversal not allowed' };
    }
    if (content === undefined || typeof content !== 'string') {
      return { success: false, error: 'Missing required field: content' };
    }

    const result = await this.fileService.writeFile(path, content);
    if (result.ok) {
      return { success: true, id: path };
    }
    return { success: false, error: result.error.message };
  }

  buildPrompt(toolName: ActionToolName, toolInput: Record<string, unknown>): string {
    switch (toolName) {
      case 'create_jira_issues':
        return this.buildBatchJiraPrompt(toolInput);
      case 'create_confluence_page':
        return this.buildConfluencePrompt(toolInput);
      case 'create_github_pr':
        return this.buildGitHubPrPrompt(toolInput);
      default:
        return this.buildGenericPrompt(toolName, toolInput);
    }
  }

  private buildGenericPrompt(toolName: ActionToolName, toolInput: Record<string, unknown>): string {
    const details = formatToolInput(toolInput);

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

  private buildBatchJiraPrompt(toolInput: Record<string, unknown>): string {
    const issues = toolInput['issues'] as Array<Record<string, unknown>> | undefined;
    if (!issues || issues.length === 0) {
      return this.buildGenericPrompt('create_jira_issues', toolInput);
    }

    const issueList = issues
      .map((issue, i) => {
        const lines = Object.entries(issue)
          .filter(([key]) => key !== 'parentRef')
          .map(([key, value]) => {
            const formatted = Array.isArray(value) ? JSON.stringify(value) : String(value);
            return `  - ${key}: ${formatted}`;
          });
        const parentRef = issue['parentRef'];
        if (parentRef !== undefined) {
          lines.push(`  - parent: issue #${parentRef} from this batch`);
        }
        return `${i + 1}. Issue:\n${lines.join('\n')}`;
      })
      .join('\n\n');

    return [
      'Execute the following batch of Jira issue creations using MCP tools.',
      'Create them in order. If an issue references a parent from this batch, use the key from the already-created parent issue.',
      '',
      'Return results as a JSON array, one entry per issue. Each entry has: success (boolean), id (issue key), url (link), error (if failed).',
      '',
      'ISSUES:',
      issueList,
      '',
      'Execute this now. Create all issues in sequence.',
    ].join('\n');
  }

  private buildConfluencePrompt(toolInput: Record<string, unknown>): string {
    const space = toolInput['space'] ?? 'unknown';
    const title = toolInput['title'] ?? 'Untitled';
    const content = toolInput['content'] ?? '';
    const parentPageId = toolInput['parentPageId'];

    const lines = [
      'Create a Confluence page using the available MCP tools. Do not modify the content.',
      'Return the result as JSON with the fields: success (boolean), id (page ID), url (link to the page), error (if failed).',
      '',
      `ACTION: create_confluence_page`,
      'DETAILS:',
      `- space: ${space}`,
      `- title: ${title}`,
    ];

    if (parentPageId) {
      lines.push(`- parentPageId: ${parentPageId}`);
    }

    lines.push(
      '',
      'PAGE CONTENT (markdown):',
      '---',
      String(content),
      '---',
      '',
      'Execute this now.',
    );

    return lines.join('\n');
  }

  private buildGitHubPrPrompt(toolInput: Record<string, unknown>): string {
    const repo = toolInput['repo'] ?? 'unknown';
    const title = toolInput['title'] ?? 'Untitled';
    const body = toolInput['body'] ?? '';
    const head = toolInput['head'] ?? 'unknown';
    const base = toolInput['base'] ?? 'main';

    return [
      'Create a GitHub pull request using the available MCP tools. Do not modify the content.',
      'Return the result as JSON with the fields: success (boolean), id (PR number), url (link to the PR), error (if failed).',
      '',
      'ACTION: create_github_pr',
      'DETAILS:',
      `- repo: ${repo}`,
      `- title: ${title}`,
      `- head: ${head}`,
      `- base: ${base}`,
      '',
      'PR BODY (markdown):',
      '---',
      String(body),
      '---',
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

  parseBatchOutput(rawOutput: string): ActionResult {
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
      const parsed = JSON.parse(jsonStr) as unknown;

      // Batch result is an array
      if (Array.isArray(parsed)) {
        const results = parsed as ActionResult[];
        const allSuccess = results.every((r) => r.success);
        const ids = results.map((r) => r.id).filter(Boolean).join(', ');
        const urls = results.map((r) => r.url).filter(Boolean).join(', ');
        const errors = results.filter((r) => !r.success).map((r) => r.error).filter(Boolean);

        if (allSuccess) {
          return { success: true, id: ids, url: urls };
        }
        return {
          success: false,
          id: ids || undefined,
          url: urls || undefined,
          error: `Partial batch failure: ${errors.join('; ') || 'some issues failed to create'}`,
        };
      }

      // Single result (fallback)
      const result = parsed as ActionResult;
      return {
        success: result.success ?? false,
        id: result.id,
        url: result.url,
        error: result.error,
      };
    } catch {
      return { success: false, error: `Failed to parse batch result: ${jsonStr.slice(0, 200)}` };
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

function formatToolInput(input: Record<string, unknown>): string {
  return Object.entries(input)
    .map(([key, value]) => {
      const formatted = Array.isArray(value) ? JSON.stringify(value) : String(value);
      return `- ${key}: ${formatted}`;
    })
    .join('\n');
}

function classifyCliError(stderr: string, exitCode: number): string {
  const lower = stderr.toLowerCase();
  if (lower.includes('authentication') || lower.includes('not authenticated') || lower.includes('login required')) {
    return `Claude CLI authentication failed. Please run 'claude login' first. (exit ${exitCode})`;
  }
  if (lower.includes('mcp') && (lower.includes('not configured') || lower.includes('not found') || lower.includes('unavailable'))) {
    return `MCP server not configured or unavailable. Check your Claude CLI MCP settings. (exit ${exitCode})`;
  }
  if (lower.includes('permission') || lower.includes('forbidden') || lower.includes('403')) {
    return `Permission denied. Check your MCP server permissions. (exit ${exitCode})`;
  }
  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many')) {
    return `Rate limited by external service. Wait and try again. (exit ${exitCode})`;
  }
  return stderr.trim() || `Claude CLI exited with code ${exitCode}`;
}

function isSpawnNotFoundError(err: Error): boolean {
  const nodeErr = err as NodeJS.ErrnoException;
  return nodeErr.code === 'ENOENT' || err.message.includes('ENOENT');
}
