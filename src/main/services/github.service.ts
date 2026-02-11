import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { Integration, GitHubConfig } from '../domain/types';
import type { IntegrationRepository } from '../repositories/integration.repository';
import type { IntegrationCacheRepository } from '../repositories/integration-cache.repository';
import type { WorkspaceService } from './workspace.service';
import type { GitHubProvider } from '../providers/github/github.provider';
import type { CircuitBreaker } from '../infrastructure/circuit-breaker';
import { CircuitOpenError } from '../infrastructure/circuit-breaker';
import { withRetry } from '../infrastructure/retry';
import type { SecureStorage } from '../infrastructure/safe-storage';
import type { GitHubRepo } from '../providers/github/github.types';
import { GITHUB_RESOURCE_TYPES } from '../providers/github/github.types';

const MAX_PRS_PER_REPO = 100;
const MAX_ISSUES_PER_REPO = 100;
const MAX_COMMENTS_PER_PR = 50;

export class GitHubService {
  constructor(
    private readonly integrationRepo: IntegrationRepository,
    private readonly cacheRepo: IntegrationCacheRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly githubProvider: GitHubProvider,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly secureStorage: SecureStorage,
  ) {}

  async getIntegration(): Promise<Result<Integration | null, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      const integration = await this.integrationRepo.findByWorkspaceAndProvider(
        workspaceId,
        'github',
      );
      return ok(integration);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to load GitHub integration', cause));
    }
  }

  async connect(pat: string): Promise<Result<Integration, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      // Validate PAT by fetching authenticated user
      const user = await this.circuitBreaker.execute(() =>
        withRetry(() => this.githubProvider.fetchAuthenticatedUser(pat)),
      );

      if (!user.login) {
        return err(
          new DomainError(ERROR_CODES.GITHUB_AUTH_FAILED, 'Invalid GitHub token'),
        );
      }

      // Store PAT securely
      this.secureStorage.store(`github_pat_${workspaceId}`, pat);

      const config: GitHubConfig = {
        selectedRepos: [],
      };

      // Upsert integration record
      const existing = await this.integrationRepo.findByWorkspaceAndProvider(
        workspaceId,
        'github',
      );
      let integration: Integration;

      if (existing) {
        await this.integrationRepo.updateConfig(existing.id, config);
        await this.integrationRepo.updateStatus(existing.id, 'connected');
        integration = {
          ...existing,
          config,
          status: 'connected',
          updatedAt: new Date().toISOString(),
        };
      } else {
        integration = await this.integrationRepo.insert(
          workspaceId,
          'github',
          config,
          'connected',
        );
      }

      return ok(integration);
    } catch (cause) {
      return err(this.mapError(cause));
    }
  }

  async disconnect(): Promise<Result<void, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      this.secureStorage.remove(`github_pat_${workspaceId}`);

      const integration = await this.integrationRepo.findByWorkspaceAndProvider(
        workspaceId,
        'github',
      );
      if (integration) {
        await this.cacheRepo.deleteByIntegration(integration.id);
        await this.integrationRepo.updateStatus(integration.id, 'disconnected');
      }

      return ok(undefined);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to disconnect GitHub', cause));
    }
  }

  async listRepos(): Promise<Result<GitHubRepo[], DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      const integration = await this.integrationRepo.findByWorkspaceAndProvider(
        workspaceId,
        'github',
      );
      if (!integration || integration.status === 'disconnected') {
        return err(
          new DomainError(ERROR_CODES.GITHUB_AUTH_FAILED, 'GitHub is not connected'),
        );
      }

      const pat = this.getPat(workspaceId);
      if (!pat) {
        return err(
          new DomainError(ERROR_CODES.GITHUB_AUTH_FAILED, 'GitHub token not found'),
        );
      }

      const allRepos: GitHubRepo[] = [];
      let page = 1;

      while (true) {
        const result = await this.circuitBreaker.execute(() =>
          withRetry(() => this.githubProvider.fetchRepos(pat, page)),
        );
        allRepos.push(...result.repos);
        if (!result.hasNext || page >= 5) break; // Cap at 250 repos
        page++;
      }

      return ok(allRepos);
    } catch (cause) {
      return err(this.mapError(cause));
    }
  }

  async sync(
    repos: string[],
  ): Promise<Result<{ syncedCount: number; warning?: string }, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    const integration = await this.integrationRepo.findByWorkspaceAndProvider(
      workspaceId,
      'github',
    );
    if (!integration || integration.status === 'disconnected') {
      return err(
        new DomainError(ERROR_CODES.GITHUB_AUTH_FAILED, 'GitHub is not connected'),
      );
    }

    const updatedConfig: GitHubConfig = {
      ...(integration.config as GitHubConfig),
      selectedRepos: repos,
    };
    await this.integrationRepo.updateConfig(integration.id, updatedConfig);

    let syncedCount = 0;

    try {
      const pat = this.getPat(workspaceId);
      if (!pat) {
        return err(
          new DomainError(ERROR_CODES.GITHUB_AUTH_FAILED, 'GitHub token not found'),
        );
      }

      for (const fullName of repos) {
        const [owner, repo] = fullName.split('/');
        if (!owner || !repo) continue;

        // Fetch PRs (open + recently closed)
        const prs = await this.fetchAllPRs(pat, owner, repo);
        for (const pr of prs) {
          await this.cacheRepo.upsert(
            integration.id,
            GITHUB_RESOURCE_TYPES.PR,
            `${fullName}#${pr.number}`,
            pr,
          );
          syncedCount++;

          // Fetch review comments for this PR
          const comments = await this.fetchPRComments(pat, owner, repo, pr.number as number);
          for (const comment of comments) {
            await this.cacheRepo.upsert(
              integration.id,
              GITHUB_RESOURCE_TYPES.PR_COMMENT,
              `${fullName}#${pr.number}_comment_${comment.id}`,
              { ...comment, prNumber: pr.number, repoFullName: fullName },
            );
            syncedCount++;
          }
        }

        // Fetch issues (open + recently closed)
        const issues = await this.fetchAllIssues(pat, owner, repo);
        for (const issue of issues) {
          await this.cacheRepo.upsert(
            integration.id,
            GITHUB_RESOURCE_TYPES.ISSUE,
            `${fullName}#${issue.number}`,
            issue,
          );
          syncedCount++;
        }
      }

      // Prune cache if needed
      await this.cacheRepo.pruneOldest(integration.id, 5000);

      // Update status and last synced
      await this.integrationRepo.updateStatus(integration.id, 'connected');
      await this.integrationRepo.updateLastSynced(integration.id);

      return ok({ syncedCount });
    } catch (cause) {
      await this.integrationRepo.updateStatus(integration.id, 'error');

      const count = await this.cacheRepo.countByIntegration(integration.id);
      if (count > 0) {
        return ok({
          syncedCount,
          warning: `Sync partially failed: ${cause instanceof Error ? cause.message : 'Unknown error'}. Stale cached data is still available.`,
        });
      }

      return err(this.mapError(cause));
    }
  }

  private async fetchAllPRs(
    pat: string,
    owner: string,
    repo: string,
  ): Promise<Array<{ number: number; [k: string]: unknown }>> {
    const allPRs: Array<{ number: number; [k: string]: unknown }> = [];
    let page = 1;

    while (allPRs.length < MAX_PRS_PER_REPO) {
      const result = await this.circuitBreaker.execute(() =>
        withRetry(() => this.githubProvider.fetchPullRequests(pat, owner, repo, 'all', page)),
      );

      for (const pr of result.prs) {
        allPRs.push(pr as unknown as { number: number; [k: string]: unknown });
        if (allPRs.length >= MAX_PRS_PER_REPO) break;
      }

      if (!result.hasNext) break;
      page++;
    }

    return allPRs;
  }

  private async fetchAllIssues(
    pat: string,
    owner: string,
    repo: string,
  ): Promise<Array<{ number: number; [k: string]: unknown }>> {
    const allIssues: Array<{ number: number; [k: string]: unknown }> = [];
    let page = 1;

    while (allIssues.length < MAX_ISSUES_PER_REPO) {
      const result = await this.circuitBreaker.execute(() =>
        withRetry(() => this.githubProvider.fetchIssues(pat, owner, repo, 'all', page)),
      );

      for (const issue of result.issues) {
        allIssues.push(issue as unknown as { number: number; [k: string]: unknown });
        if (allIssues.length >= MAX_ISSUES_PER_REPO) break;
      }

      if (!result.hasNext) break;
      page++;
    }

    return allIssues;
  }

  private async fetchPRComments(
    pat: string,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<Array<{ id: number; [k: string]: unknown }>> {
    const allComments: Array<{ id: number; [k: string]: unknown }> = [];
    let page = 1;

    while (allComments.length < MAX_COMMENTS_PER_PR) {
      const result = await this.circuitBreaker.execute(() =>
        withRetry(() => this.githubProvider.fetchPRComments(pat, owner, repo, prNumber, page)),
      );

      for (const comment of result.comments) {
        allComments.push(comment as unknown as { id: number; [k: string]: unknown });
        if (allComments.length >= MAX_COMMENTS_PER_PR) break;
      }

      if (!result.hasNext) break;
      page++;
    }

    return allComments;
  }

  private getPat(workspaceId: string): string | null {
    return this.secureStorage.retrieve(`github_pat_${workspaceId}`);
  }

  private mapError(cause: unknown): DomainError {
    if (cause instanceof CircuitOpenError) {
      return new DomainError(ERROR_CODES.CIRCUIT_OPEN, 'Service temporarily unavailable', cause);
    }

    if (isHttpError(cause)) {
      if (cause.status === 401 || cause.status === 403) {
        return new DomainError(
          ERROR_CODES.GITHUB_AUTH_FAILED,
          'GitHub authentication failed',
          cause,
        );
      }
      if (cause.status === 429) {
        return new DomainError(
          ERROR_CODES.GITHUB_RATE_LIMITED,
          'Rate limited by GitHub — try again later',
          cause,
        );
      }
    }

    return new DomainError(
      ERROR_CODES.GITHUB_FETCH_FAILED,
      cause instanceof Error ? cause.message : 'Failed to communicate with GitHub',
      cause,
    );
  }
}

function isHttpError(error: unknown): error is { status: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: number }).status === 'number'
  );
}
