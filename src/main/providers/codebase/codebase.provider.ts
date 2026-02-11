import { spawn, execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { CodebaseAnalysis, CodebasePrerequisites, CodebaseAnalysisOptions } from './codebase.types';

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
  ): Promise<CodebaseAnalysis> {
    const allowedTools = [
      'Read',
      'Glob',
      'Grep',
      'Bash(git log:*)',
      'Bash(git shortlog:*)',
      'Bash(git blame:*)',
      'Bash(find:*)',
      'Bash(wc:*)',
    ].join(',');

    const args = [
      '--print',
      '--output-format',
      'json',
      '--allowedTools',
      allowedTools,
      '--model',
      options.model,
      '--max-turns',
      String(options.maxTurns),
      '-p',
      prompt,
    ];

    const { stdout, stderr, exitCode } = await this.spawnWithTimeout(
      'claude',
      args,
      repoPath,
      options.timeoutMs,
    );

    if (exitCode !== 0) {
      const errorMsg = stderr.trim() || `Claude CLI exited with code ${exitCode}`;
      const error = new Error(errorMsg);
      (error as Error & { exitCode: number }).exitCode = exitCode;
      throw error;
    }

    return this.parseOutput(stdout);
  }

  parseOutput(rawOutput: string): CodebaseAnalysis {
    // Claude CLI --output-format json wraps output in a JSON envelope
    // with a "result" field containing the text response
    let textContent: string;

    try {
      const envelope = JSON.parse(rawOutput) as { result?: string; content?: string };
      textContent = envelope.result ?? envelope.content ?? rawOutput;
    } catch {
      // If outer parse fails, treat the entire output as the text
      textContent = rawOutput;
    }

    // Extract JSON from code fence if present
    const fenceMatch = textContent.match(/```json\s*([\s\S]*?)```/);
    const jsonStr = fenceMatch ? fenceMatch[1]!.trim() : textContent.trim();

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
        // Check if any MCP server name contains "jira"
        resolve(stdout.toLowerCase().includes('jira'));
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
