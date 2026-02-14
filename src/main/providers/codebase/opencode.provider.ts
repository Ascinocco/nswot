import { spawn, execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { CodebaseAnalysis, CodebasePrerequisites, CodebaseAnalysisOptions } from './codebase.types';
import type { CodebaseProviderInterface } from './codebase-provider.interface';

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export class OpenCodeProvider implements CodebaseProviderInterface {
  readonly name = 'opencode';

  async isAvailable(): Promise<boolean> {
    return this.commandExists('opencode');
  }

  async checkPrerequisites(): Promise<CodebasePrerequisites> {
    const [cli, git] = await Promise.all([
      this.commandExists('opencode'),
      this.commandExists('git'),
    ]);

    // OpenCode doesn't have a separate auth check or Jira MCP concept
    return {
      cli,
      cliAuthenticated: cli, // If installed, assume configured
      git,
      jiraMcp: false,
    };
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
    _jiraMcpAvailable: boolean = false,
    onProgress?: (message: string) => void,
  ): Promise<CodebaseAnalysis> {
    const args = [
      '--print',
      '--output-format',
      'stream-json',
      '--max-turns',
      String(options.maxTurns),
      '-p',
      prompt,
    ];

    const startTime = Date.now();
    const heartbeat = onProgress
      ? setInterval(() => {
          const elapsed = Math.round((Date.now() - startTime) / 60_000);
          onProgress(`Still analyzing... ${elapsed}m elapsed`);
        }, 30_000)
      : null;

    try {
      const onStderr = onProgress
        ? (line: string) => { onProgress(`[opencode] ${line}`); }
        : undefined;

      const result = await this.spawnWithCapture(
        'opencode', args, repoPath, options.timeoutMs, onStderr,
      );

      const { text: textContent } = this.extractResultFromStreamJson(result.stdout);

      if (result.timedOut) {
        if (textContent) {
          try {
            const analysis = this.parseOutput(textContent);
            analysis.partial = true;
            return analysis;
          } catch {
            // Partial content not parseable
          }
        }
        const elapsed = Math.round((Date.now() - startTime) / 60_000);
        const error = new Error(`Analysis timed out after ${elapsed}m`);
        (error as Error & { timeout: true }).timeout = true;
        throw error;
      }

      if (result.exitCode !== 0) {
        const errorMsg = result.stderr.trim() || `opencode exited with code ${result.exitCode}`;
        const error = new Error(errorMsg);
        (error as Error & { exitCode: number }).exitCode = result.exitCode;
        throw error;
      }

      if (!textContent) {
        const error = new Error('opencode produced no output');
        (error as Error & { parseError: true }).parseError = true;
        throw error;
      }

      return this.parseOutput(textContent);
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }
  }

  private extractResultFromStreamJson(stdout: string): { text: string; maxTurnsExceeded: boolean } {
    let lastTextContent = '';
    let maxTurnsExceeded = false;
    const lines = stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (parsed.type === 'result') {
          if (parsed.subtype === 'error_max_turns') {
            maxTurnsExceeded = true;
          }
          if (typeof parsed.result === 'string') {
            return { text: parsed.result, maxTurnsExceeded };
          }
        }
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
        if ('repo' in parsed && 'architecture' in parsed) {
          return { text: trimmed, maxTurnsExceeded };
        }
      } catch {
        if (trimmed.length > lastTextContent.length) {
          lastTextContent = trimmed;
        }
      }
    }
    return { text: lastTextContent, maxTurnsExceeded };
  }

  parseOutput(rawOutput: string): CodebaseAnalysis {
    let jsonStr = rawOutput.trim();

    if (jsonStr.startsWith('{') && !jsonStr.includes('"repo"')) {
      try {
        const envelope = JSON.parse(jsonStr) as { result?: string; content?: string };
        const inner = envelope.result ?? envelope.content;
        if (inner) {
          jsonStr = inner.trim();
        }
      } catch {
        // Not an envelope
      }
    }

    const fenceMatch = jsonStr.match(/```json\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1]!.trim();
    }

    try {
      const analysis = JSON.parse(jsonStr) as CodebaseAnalysis;
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
      // Strip PAT from error messages to prevent secret leakage
      const sanitized = stderr.replace(/https:\/\/[^@]+@/g, 'https://***@');
      throw new Error(`git clone failed: ${sanitized.trim()}`);
    }
  }

  private async gitPull(repoDir: string): Promise<void> {
    const { exitCode, stderr } = await this.spawnWithTimeout(
      'git', ['pull', '--ff-only'], repoDir, 60_000,
    );
    if (exitCode !== 0) {
      console.warn(`git pull failed for ${repoDir}: ${stderr.trim()}`);
    }
  }

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

      let settled = false;

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
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
