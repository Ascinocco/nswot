import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { Integration, CodebaseConfig } from '../domain/types';
import type { IntegrationRepository } from '../repositories/integration.repository';
import type { IntegrationCacheRepository } from '../repositories/integration-cache.repository';
import type { WorkspaceService } from './workspace.service';
import type { CodebaseProvider } from '../providers/codebase/codebase.provider';
import type { SecureStorage } from '../infrastructure/safe-storage';
import type {
  CodebaseAnalysis,
  CodebaseAnalysisOptions,
  CodebasePrerequisites,
} from '../providers/codebase/codebase.types';
import {
  CODEBASE_RESOURCE_TYPES,
  DEFAULT_ANALYSIS_OPTIONS,
} from '../providers/codebase/codebase.types';
import { buildCodebaseAnalysisPrompt } from '../providers/codebase/codebase-prompt';
import { validateWorkspacePath } from '../infrastructure/file-system';
import { join } from 'path';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';

export interface CodebaseProgress {
  repo: string;
  stage: 'cloning' | 'analyzing' | 'parsing' | 'done' | 'failed';
  message: string;
}

export class CodebaseService {
  constructor(
    private readonly integrationRepo: IntegrationRepository,
    private readonly cacheRepo: IntegrationCacheRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly codebaseProvider: CodebaseProvider,
    private readonly secureStorage: SecureStorage,
  ) {}

  async checkPrerequisites(): Promise<Result<CodebasePrerequisites, DomainError>> {
    try {
      const prereqs = await this.codebaseProvider.checkPrerequisites();
      return ok(prereqs);
    } catch (cause) {
      return err(
        new DomainError(
          ERROR_CODES.INTERNAL_ERROR,
          'Failed to check codebase analysis prerequisites',
          cause,
        ),
      );
    }
  }

  async analyzeRepos(
    repos: string[],
    options: Partial<CodebaseAnalysisOptions>,
    jiraProjectKeys: string[],
    onProgress: (progress: CodebaseProgress) => void,
  ): Promise<
    Result<
      {
        results: CodebaseAnalysis[];
        failures: Array<{ repo: string; error: string }>;
      },
      DomainError
    >
  > {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    const workspaceResult = await this.workspaceService.getCurrent();
    if (!workspaceResult.ok) {
      return err(workspaceResult.error);
    }
    const workspace = workspaceResult.value;
    if (!workspace) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    const pat = this.getGitHubPat(workspaceId);
    if (!pat) {
      return err(
        new DomainError(
          ERROR_CODES.CODEBASE_CLONE_FAILED,
          'GitHub is not connected. Connect GitHub first to clone repos for codebase analysis.',
        ),
      );
    }

    // Check prerequisites
    const prereqs = await this.codebaseProvider.checkPrerequisites();
    if (!prereqs.cli) {
      return err(
        new DomainError(
          ERROR_CODES.CODEBASE_CLI_NOT_FOUND,
          'Claude CLI is required for codebase analysis. Install it from https://docs.anthropic.com/en/docs/claude-code',
        ),
      );
    }
    if (!prereqs.cliAuthenticated) {
      return err(
        new DomainError(
          ERROR_CODES.CODEBASE_CLI_NOT_AUTHENTICATED,
          'Claude CLI is not authenticated. Run `claude` in your terminal to sign in.',
        ),
      );
    }
    if (!prereqs.git) {
      return err(
        new DomainError(
          ERROR_CODES.CODEBASE_GIT_NOT_FOUND,
          'Git is required for cloning repos. Install it from https://git-scm.com',
        ),
      );
    }

    const mergedOptions: CodebaseAnalysisOptions = {
      ...DEFAULT_ANALYSIS_OPTIONS,
      ...options,
    };

    // Get or create codebase integration record for caching
    const integration = await this.getOrCreateIntegration(workspaceId);

    // Update selected repos in config
    const config: CodebaseConfig = { selectedRepos: repos };
    await this.integrationRepo.updateConfig(integration.id, config);

    const results: CodebaseAnalysis[] = [];
    const failures: Array<{ repo: string; error: string }> = [];

    for (const repo of repos) {
      try {
        // Clone or pull
        onProgress({ repo, stage: 'cloning', message: `Cloning ${repo}...` });
        const repoDir = this.getRepoDir(workspace.path, repo);
        await this.codebaseProvider.cloneOrPull(repo, repoDir, pat, mergedOptions.shallow);

        // Build prompt
        const prompt = buildCodebaseAnalysisPrompt(repo, prereqs.jiraMcp, jiraProjectKeys);

        // Analyze
        onProgress({ repo, stage: 'analyzing', message: `Claude is analyzing ${repo}...` });
        let analysis: CodebaseAnalysis;
        try {
          analysis = await this.codebaseProvider.analyze(repoDir, prompt, mergedOptions);
        } catch (firstError) {
          // Retry once on parse failure
          if (this.isParseError(firstError)) {
            onProgress({
              repo,
              stage: 'analyzing',
              message: `Retrying analysis of ${repo} (parse error)...`,
            });
            analysis = await this.codebaseProvider.analyze(repoDir, prompt, mergedOptions);
          } else {
            throw firstError;
          }
        }

        // Cache result
        onProgress({ repo, stage: 'parsing', message: `Caching analysis for ${repo}...` });
        await this.cacheRepo.upsert(
          integration.id,
          CODEBASE_RESOURCE_TYPES.ANALYSIS,
          repo,
          analysis,
        );

        results.push(analysis);
        onProgress({ repo, stage: 'done', message: `Analysis complete for ${repo}` });
      } catch (cause) {
        const errorMessage = this.extractErrorMessage(cause, repo);
        failures.push({ repo, error: errorMessage });
        onProgress({ repo, stage: 'failed', message: errorMessage });
      }
    }

    // Update integration status
    if (results.length > 0) {
      await this.integrationRepo.updateStatus(integration.id, 'connected');
      await this.integrationRepo.updateLastSynced(integration.id);
    }

    return ok({ results, failures });
  }

  async getCachedAnalysis(repo: string): Promise<Result<CodebaseAnalysis | null, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      const integration = await this.integrationRepo.findByWorkspaceAndProvider(
        workspaceId,
        'codebase',
      );
      if (!integration) {
        return ok(null);
      }

      const entry = await this.cacheRepo.findEntry(
        integration.id,
        CODEBASE_RESOURCE_TYPES.ANALYSIS,
        repo,
      );
      if (!entry) {
        return ok(null);
      }

      return ok(entry.data as CodebaseAnalysis);
    } catch (cause) {
      return err(
        new DomainError(ERROR_CODES.DB_ERROR, 'Failed to load cached codebase analysis', cause),
      );
    }
  }

  async clearClonedRepos(): Promise<Result<void, DomainError>> {
    const workspaceResult = await this.workspaceService.getCurrent();
    if (!workspaceResult.ok) {
      return err(workspaceResult.error);
    }
    const workspace = workspaceResult.value;
    if (!workspace) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      const reposDir = join(workspace.path, '.nswot', 'repos');
      if (existsSync(reposDir)) {
        await rm(reposDir, { recursive: true, force: true });
      }

      // Also clear cached analyses
      const integration = await this.integrationRepo.findByWorkspaceAndProvider(
        workspace.id,
        'codebase',
      );
      if (integration) {
        await this.cacheRepo.deleteByIntegration(integration.id);
      }

      return ok(undefined);
    } catch (cause) {
      return err(
        new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to clear cloned repos', cause),
      );
    }
  }

  private async getOrCreateIntegration(workspaceId: string): Promise<Integration> {
    const existing = await this.integrationRepo.findByWorkspaceAndProvider(
      workspaceId,
      'codebase',
    );
    if (existing) return existing;

    const config: CodebaseConfig = { selectedRepos: [] };
    return this.integrationRepo.insert(workspaceId, 'codebase', config, 'connected');
  }

  private getRepoDir(workspacePath: string, repoFullName: string): string {
    const [owner, repo] = repoFullName.split('/');
    if (!owner || !repo) {
      throw new DomainError(
        ERROR_CODES.CODEBASE_CLONE_FAILED,
        `Invalid repo name: ${repoFullName}. Expected "owner/repo" format.`,
      );
    }
    const relativePath = join('.nswot', 'repos', owner, repo);
    // Validate path stays within workspace
    validateWorkspacePath(workspacePath, relativePath);
    return join(workspacePath, relativePath);
  }

  private getGitHubPat(workspaceId: string): string | null {
    return this.secureStorage.retrieve(`github_pat_${workspaceId}`);
  }

  private isParseError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'parseError' in error &&
      (error as { parseError: boolean }).parseError === true
    );
  }

  private isTimeoutError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'timeout' in error &&
      (error as { timeout: boolean }).timeout === true
    );
  }

  private extractErrorMessage(cause: unknown, repo: string): string {
    if (this.isTimeoutError(cause)) {
      return `Analysis of ${repo} timed out. Try reducing max turns or use a faster model.`;
    }
    if (this.isParseError(cause)) {
      return `Could not parse analysis output for ${repo} after retry.`;
    }
    if (cause instanceof Error) {
      // Check for ENOENT (command not found)
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
        return `Required command not found while analyzing ${repo}.`;
      }
      return `Analysis failed for ${repo}: ${cause.message}`;
    }
    return `Analysis failed for ${repo}: Unknown error`;
  }
}
