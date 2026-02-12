import { spawn, execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { CodebaseAnalysis, CodebasePrerequisites, CodebaseAnalysisOptions } from './codebase.types';

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
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
      '--verbose',
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

    // Heartbeat: emit elapsed time every 30s so UI shows the analysis is alive
    const startTime = Date.now();
    const heartbeat = onProgress
      ? setInterval(() => {
          const elapsed = Math.round((Date.now() - startTime) / 60_000);
          onProgress(`Still analyzing... ${elapsed}m elapsed`);
        }, 30_000)
      : null;

    try {
      const onStderr = onProgress
        ? (line: string) => { onProgress(`[claude] ${line}`); }
        : undefined;

      const result = await this.spawnWithCapture(
        'claude', args, repoPath, options.timeoutMs, onStderr,
      );

      // Try to extract result from stream-json events
      const { text: textContent, maxTurnsExceeded } = this.extractResultFromStreamJson(result.stdout);

      if (result.timedOut) {
        // Try to salvage partial output from whatever Claude produced before timeout
        if (textContent) {
          try {
            const analysis = this.parseOutput(textContent);
            analysis.partial = true;
            return analysis;
          } catch {
            // Partial content not parseable as valid analysis JSON
          }
        }
        const elapsed = Math.round((Date.now() - startTime) / 60_000);
        const hasOutput = result.stdout.trim().length > 0;
        const msg = hasOutput
          ? `Analysis timed out after ${elapsed}m (output was not parseable as JSON)`
          : `Analysis timed out after ${elapsed}m with no output — Claude CLI may not be responding`;
        const error = new Error(msg);
        (error as Error & { timeout: true }).timeout = true;
        throw error;
      }

      if (result.exitCode !== 0) {
        const errorMsg = result.stderr.trim() || `Claude CLI exited with code ${result.exitCode}`;
        const error = new Error(errorMsg);
        (error as Error & { exitCode: number }).exitCode = result.exitCode;
        throw error;
      }

      // Claude ran out of turns before producing output — not a parse error, don't retry
      if (maxTurnsExceeded && !textContent) {
        throw new Error(
          `Claude used all available turns exploring the codebase and did not produce analysis output. Try Deep Analysis mode for more turns.`,
        );
      }

      if (!textContent) {
        const error = new Error('Claude CLI produced no output');
        (error as Error & { parseError: true }).parseError = true;
        throw error;
      }

      return this.parseOutput(textContent);
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }
  }

  /**
   * Extract the final text result from stream-json output.
   * Stream-json emits one JSON event per line. The final result is in a
   * `{type: "result", result: "..."}` event, or in `assistant` message text blocks.
   */
  /**
   * Extract the final text result from stream-json output.
   * Stream-json emits one JSON event per line. The final result is in a
   * `{type: "result", result: "..."}` event, or in `assistant` message text blocks.
   * Returns `{ text, maxTurnsExceeded }`.
   */
  private extractResultFromStreamJson(stdout: string): { text: string; maxTurnsExceeded: boolean } {
    let lastTextContent = '';
    let maxTurnsExceeded = false;
    const lines = stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        // Stream-json result event — the final output
        if (parsed.type === 'result') {
          if (parsed.subtype === 'error_max_turns') {
            maxTurnsExceeded = true;
          }
          if (typeof parsed.result === 'string') {
            return { text: parsed.result, maxTurnsExceeded };
          }
        }
        // Stream-json assistant event — extract text blocks
        if (parsed.type === 'assistant' && parsed.message) {
          const msg = parsed.message as { content: Array<{ type: string; text?: string }> };
          if (msg.content) {
            for (const block of msg.content) {
              if (block.type === 'text' && block.text) {
                lastTextContent = block.text;
              }
            }
          }
        }
        // Direct analysis JSON (not wrapped in event) — return as raw string
        if ('repo' in parsed && 'architecture' in parsed) {
          return { text: trimmed, maxTurnsExceeded };
        }
      } catch {
        // Not a JSON line — might be raw text output, use as fallback
        if (trimmed.length > lastTextContent.length) {
          lastTextContent = trimmed;
        }
      }
    }
    return { text: lastTextContent, maxTurnsExceeded };
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

  /**
   * Spawn a process and capture its output. Unlike spawnWithTimeout, this method
   * ALWAYS resolves (never rejects) — on timeout it kills the process and returns
   * whatever stdout was accumulated, allowing callers to salvage partial results.
   *
   * IMPORTANT: Uses 'ignore' for stdin to prevent the child process from blocking
   * on stdin reads. Claude CLI with --print -p reads the prompt from the -p arg,
   * but an open stdin pipe can cause it to hang waiting for EOF.
   */
  private spawnWithCapture(
    command: string,
    args: string[],
    cwd: string | undefined,
    timeoutMs: number,
    onStderr?: (line: string) => void,
  ): Promise<SpawnResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let stderrLineBuffer = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill('SIGTERM');
          // Give it a moment to flush stdout, then force kill
          setTimeout(() => {
            try { child.kill('SIGKILL'); } catch { /* already dead */ }
          }, 5_000);
          resolve({ stdout, stderr, exitCode: -1, timedOut: true });
        }
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        if (onStderr) {
          stderrLineBuffer += text;
          const lines = stderrLineBuffer.split('\n');
          stderrLineBuffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) onStderr(trimmed);
          }
        }
      });

      child.on('close', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ stdout, stderr, exitCode: code ?? 1, timedOut: false });
        }
      });

      child.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          // Treat spawn errors (e.g., ENOENT for missing command) as immediate failures
          resolve({ stdout, stderr: err.message, exitCode: -1, timedOut: false });
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
