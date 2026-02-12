import { spawn, execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { CodebaseAnalysis, CodebasePrerequisites, CodebaseAnalysisOptions } from './codebase.types';

interface StreamJsonContentBlock {
  type: string;
  name?: string;
  input?: Record<string, unknown>;
  text?: string;
}

interface StreamJsonEvent {
  type: string;
  message?: { content: StreamJsonContentBlock[] };
  result?: string;
}

export class CodebaseProvider {
  async checkPrerequisites(): Promise<CodebasePrerequisites> {
    const [cli, git] = await Promise.all([
      this.commandExists('claude'),
      this.commandExists('git'),
    ]);

    let cliAuthenticated = false;
    let jiraMcp = false;

    if (cli) {
      cliAuthenticated = await this.checkClaudeAuth();
      jiraMcp = await this.checkJiraMcp();
    }

    return { cli, cliAuthenticated, git, jiraMcp };
  }

  async cloneOrPull(
    repoFullName: string,
    targetDir: string,
    pat: string,
    shallow: boolean,
  ): Promise<void> {
    if (existsSync(targetDir)) {
      await this.gitPull(targetDir);
    } else {
      await mkdir(dirname(targetDir), { recursive: true });
      await this.gitClone(repoFullName, targetDir, pat, shallow);
    }
  }

  async analyze(
    repoPath: string,
    prompt: string,
    options: CodebaseAnalysisOptions,
    jiraMcpAvailable: boolean = false,
    onProgress?: (message: string) => void,
  ): Promise<CodebaseAnalysis> {
    const tools = [
      'Read',
      'Glob',
      'Grep',
      'Bash(git log:*)',
      'Bash(git shortlog:*)',
      'Bash(git blame:*)',
      'Bash(find:*)',
      'Bash(wc:*)',
    ];

    if (jiraMcpAvailable) {
      tools.push('mcp__jira');
    }

    const allowedTools = tools.join(',');

    const args = [
      '--print',
      '--output-format',
      'stream-json',
      '--allowedTools',
      allowedTools,
      '--model',
      options.model,
      '--max-turns',
      String(options.maxTurns),
      '-p',
      prompt,
    ];

    let lastTextContent = '';
    const { exitCode, stderr } = await this.spawnStreamJson(
      'claude',
      args,
      repoPath,
      options.timeoutMs,
      (event) => {
        // Parse streaming events for progress and collect final text
        if (event.type === 'assistant' && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'tool_use' && onProgress) {
              const toolName = block.name ?? 'unknown';
              const input = block.input ?? {};
              const detail = this.summarizeToolCall(toolName, input);
              onProgress(detail);
            }
            if (block.type === 'text' && block.text) {
              lastTextContent = block.text;
            }
          }
        }
        // Also handle result event which has the final text
        if (event.type === 'result' && event.result) {
          lastTextContent = event.result;
        }
      },
    );

    if (exitCode !== 0) {
      const errorMsg = stderr.trim() || `Claude CLI exited with code ${exitCode}`;
      const error = new Error(errorMsg);
      (error as Error & { exitCode: number }).exitCode = exitCode;
      throw error;
    }

    if (!lastTextContent) {
      const error = new Error('Claude CLI produced no output');
      (error as Error & { parseError: true }).parseError = true;
      throw error;
    }

    return this.parseOutput(lastTextContent);
  }

  private summarizeToolCall(toolName: string, input: Record<string, unknown>): string {
    switch (toolName) {
      case 'Read':
        return `Reading ${String(input.file_path ?? input.path ?? 'file')}`;
      case 'Glob':
        return `Searching for ${String(input.pattern ?? 'files')}`;
      case 'Grep':
        return `Grepping for "${String(input.pattern ?? '...')}"`;
      case 'Bash':
        return `Running: ${String(input.command ?? 'command').slice(0, 80)}`;
      default:
        if (toolName.startsWith('mcp__')) {
          return `Querying ${toolName.replace('mcp__', '')}`;
        }
        return `Using ${toolName}`;
    }
  }

  parseOutput(rawOutput: string): CodebaseAnalysis {
    let jsonStr = rawOutput.trim();

    // Try envelope unwrapping first (handles JSON-serialized envelopes with escaped content)
    if (jsonStr.startsWith('{') && !jsonStr.includes('"repo"')) {
      try {
        const envelope = JSON.parse(jsonStr) as { result?: string; content?: string };
        const inner = envelope.result ?? envelope.content;
        if (inner) {
          jsonStr = inner.trim();
        }
      } catch {
        // Not an envelope, continue with original
      }
    }

    // Extract JSON from code fence if present
    const fenceMatch = jsonStr.match(/```json\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1]!.trim();
    }

    try {
      const analysis = JSON.parse(jsonStr) as CodebaseAnalysis;

      // Basic validation
      if (!analysis.repo || !analysis.architecture || !analysis.quality) {
        throw new Error('Missing required fields in analysis output');
      }

      return analysis;
    } catch (cause) {
      const error = new Error(
        `Failed to parse codebase analysis JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      (error as Error & { parseError: true }).parseError = true;
      throw error;
    }
  }

  private async commandExists(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('which', [command], (error) => {
        resolve(error === null);
      });
    });
  }

  private async checkClaudeAuth(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('claude', ['--version'], { timeout: 10_000 }, (error) => {
        resolve(error === null);
      });
    });
  }

  private async checkJiraMcp(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('claude', ['mcp', 'list'], {
        timeout: 10_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          resolve(false);
          return;
        }
        // Check each line for a server name containing "jira" or "atlassian"
        // MCP list output format: "server-name  type\n"
        const lines = stdout.trim().split('\n').filter((l) => l.trim().length > 0);
        const hasJira = lines.some((line) => {
          const serverName = line.split(/\s+/)[0]?.toLowerCase() ?? '';
          return serverName.includes('jira') || serverName.includes('atlassian');
        });
        resolve(hasJira);
      });

      child.on('error', () => {
        resolve(false);
      });
    });
  }

  private async gitClone(
    repoFullName: string,
    targetDir: string,
    pat: string,
    shallow: boolean,
  ): Promise<void> {
    const cloneUrl = `https://${pat}@github.com/${repoFullName}.git`;
    const args = ['clone'];
    if (shallow) {
      args.push('--depth', '1');
    }
    args.push(cloneUrl, targetDir);

    const { exitCode, stderr } = await this.spawnWithTimeout('git', args, undefined, 120_000);

    if (exitCode !== 0) {
      throw new Error(`git clone failed: ${stderr.trim()}`);
    }
  }

  private async gitPull(repoDir: string): Promise<void> {
    const { exitCode, stderr } = await this.spawnWithTimeout(
      'git',
      ['pull', '--ff-only'],
      repoDir,
      60_000,
    );

    if (exitCode !== 0) {
      // Pull failure is non-fatal — stale clone still usable
      console.warn(`git pull failed for ${repoDir}: ${stderr.trim()}`);
    }
  }

  private spawnStreamJson(
    command: string,
    args: string[],
    cwd: string | undefined,
    timeoutMs: number,
    onEvent: (event: StreamJsonEvent) => void,
  ): Promise<{ stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const child = spawn(command, args, {
        cwd,
        signal: controller.signal,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      let stdoutBuffer = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed) as StreamJsonEvent;
            onEvent(event);
          } catch {
            // Non-JSON line, skip
          }
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        // Process remaining buffer
        if (stdoutBuffer.trim()) {
          try {
            const event = JSON.parse(stdoutBuffer.trim()) as StreamJsonEvent;
            onEvent(event);
          } catch {
            // ignore
          }
        }
        resolve({ stderr, exitCode: code ?? 1 });
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          const timeoutError = new Error(`Command timed out after ${timeoutMs}ms`);
          (timeoutError as Error & { timeout: true }).timeout = true;
          reject(timeoutError);
        } else {
          reject(err);
        }
      });
    });
  }

  private spawnWithTimeout(
    command: string,
    args: string[],
    cwd: string | undefined,
    timeoutMs: number,
    onStderr?: (line: string) => void,
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
      let stderrBuffer = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        if (onStderr) {
          stderrBuffer += text;
          const lines = stderrBuffer.split('\n');
          stderrBuffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) onStderr(trimmed);
          }
        }
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          const timeoutError = new Error(`Command timed out after ${timeoutMs}ms`);
          (timeoutError as Error & { timeout: true }).timeout = true;
          reject(timeoutError);
        } else {
          reject(err);
        }
      });
    });
  }
}
