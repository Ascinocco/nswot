import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { Integration, CodebaseConfig } from '../domain/types';
import type { IntegrationRepository } from '../repositories/integration.repository';
import type { IntegrationCacheRepository } from '../repositories/integration-cache.repository';
import type { WorkspaceService } from './workspace.service';
import type { CodebaseProviderInterface } from '../providers/codebase/codebase-provider.interface';
import type { SecureStorage } from '../infrastructure/safe-storage';
import type {
  CodebaseAnalysis,
  CodebaseAnalysisOptions,
  CodebasePrerequisites,
  AnalysisDepth,
} from '../providers/codebase/codebase.types';
import {
  CODEBASE_RESOURCE_TYPES,
  DEFAULT_ANALYSIS_OPTIONS,
  ANALYSIS_DEPTH_CONFIGS,
} from '../providers/codebase/codebase.types';
import { buildCodebaseAnalysisPrompt } from '../providers/codebase/codebase-prompt';
import { validateWorkspacePath } from '../infrastructure/file-system';
import { join } from 'path';
import { rm, stat, readdir } from 'fs/promises';
import { existsSync } from 'fs';

export interface CodebaseProgress {
  repo: string;
  stage: 'cloning' | 'analyzing' | 'parsing' | 'done' | 'failed';
  message: string;
}

export interface RepoAnalysisInfo {
  repo: string;
  analyzedAt: string;
  fetchedAt: string;
}

export interface CodebaseStorageInfo {
  totalBytes: number;
  repoCount: number;
}

export class CodebaseService {
  constructor(
    private readonly integrationRepo: IntegrationRepository,
    private readonly cacheRepo: IntegrationCacheRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly codebaseProvider: CodebaseProviderInterface,
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

    const depth: AnalysisDepth = options.depth ?? DEFAULT_ANALYSIS_OPTIONS.depth;
    const depthConfig = ANALYSIS_DEPTH_CONFIGS[depth];
    const mergedOptions: CodebaseAnalysisOptions = {
      ...DEFAULT_ANALYSIS_OPTIONS,
      ...depthConfig,
      ...options,
    };

    // Get or create codebase integration record for caching
    const integration = await this.getOrCreateIntegration(workspaceId);

    // Update selected repos in config
    const config: CodebaseConfig = { selectedRepos: repos };
    await this.integrationRepo.updateConfig(integration.id, config);

    const results: CodebaseAnalysis[] = [];
    const failures: Array<{ repo: string; error: string }> = [];

    const analyzeRepo = async (repo: string): Promise<void> => {
      try {
        // Clone or pull
        onProgress({ repo, stage: 'cloning', message: `Cloning ${repo}...` });
        const repoDir = this.getRepoDir(workspace.path, repo);
        await this.codebaseProvider.cloneOrPull(repo, repoDir, pat, mergedOptions.shallow);

        // Build prompt — include git history section when full clone is used
        const prompt = buildCodebaseAnalysisPrompt(
          repo,
          prereqs.jiraMcp,
          jiraProjectKeys,
          !mergedOptions.shallow,
          mergedOptions.depth,
        );

        // Analyze
        onProgress({ repo, stage: 'analyzing', message: `Claude is analyzing ${repo}...` });
        const onToolProgress = (message: string): void => {
          onProgress({ repo, stage: 'analyzing', message });
        };
        let analysis: CodebaseAnalysis;
        try {
          analysis = await this.codebaseProvider.analyze(repoDir, prompt, mergedOptions, prereqs.jiraMcp, onToolProgress);
        } catch (firstError) {
          // Retry once on parse failure
          if (this.isParseError(firstError)) {
            onProgress({
              repo,
              stage: 'analyzing',
              message: `Retrying analysis of ${repo} (parse error)...`,
            });
            analysis = await this.codebaseProvider.analyze(repoDir, prompt, mergedOptions, prereqs.jiraMcp, onToolProgress);
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
        const doneMsg = analysis.partial
          ? `Partial analysis saved for ${repo} (timed out but salvaged results)`
          : `Analysis complete for ${repo}`;
        onProgress({ repo, stage: 'done', message: doneMsg });
      } catch (cause) {
        const errorMessage = this.extractErrorMessage(cause, repo);
        failures.push({ repo, error: errorMessage });
        onProgress({ repo, stage: 'failed', message: errorMessage });
      }
    };

    await Promise.all(repos.map(analyzeRepo));

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

  async listCachedAnalyses(): Promise<Result<RepoAnalysisInfo[], DomainError>> {
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
        return ok([]);
      }

      const entries = await this.cacheRepo.findByType(
        integration.id,
        CODEBASE_RESOURCE_TYPES.ANALYSIS,
      );

      const infos: RepoAnalysisInfo[] = entries.map((entry) => {
        const analysis = entry.data as CodebaseAnalysis;
        return {
          repo: entry.resourceId,
          analyzedAt: analysis.analyzedAt,
          fetchedAt: entry.fetchedAt,
        };
      });

      return ok(infos);
    } catch (cause) {
      return err(
        new DomainError(ERROR_CODES.DB_ERROR, 'Failed to list cached analyses', cause),
      );
    }
  }

  async getStorageSize(): Promise<Result<CodebaseStorageInfo, DomainError>> {
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
      if (!existsSync(reposDir)) {
        return ok({ totalBytes: 0, repoCount: 0 });
      }

      const { totalBytes, repoCount } = await this.calculateDirSize(reposDir);
      return ok({ totalBytes, repoCount });
    } catch (cause) {
      return err(
        new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to calculate storage size', cause),
      );
    }
  }

  private async calculateDirSize(dirPath: string): Promise<{ totalBytes: number; repoCount: number }> {
    let totalBytes = 0;
    let repoCount = 0;

    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        // Count owner/repo directories (depth 2)
        const subEntries = await readdir(fullPath, { withFileTypes: true });
        for (const subEntry of subEntries) {
          if (subEntry.isDirectory()) {
            repoCount++;
            totalBytes += await this.getDirectorySize(join(fullPath, subEntry.name));
          }
        }
      }
    }

    return { totalBytes, repoCount };
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += await this.getDirectorySize(fullPath);
      } else {
        const fileStat = await stat(fullPath);
        size += fileStat.size;
      }
    }
    return size;
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
      const detail = cause instanceof Error ? cause.message : '';
      const noOutput = detail.includes('no output');
      const hint = noOutput
        ? 'Claude CLI may not be responding. Check that `claude --version` works in your terminal.'
        : 'Try using Deep Analysis mode for large repos, or re-analyze with fewer selected repos.';
      return `Analysis of ${repo} timed out. ${hint}`;
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
