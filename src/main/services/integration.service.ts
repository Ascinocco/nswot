import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { Integration, JiraConfig } from '../domain/types';
import type { IntegrationRepository } from '../repositories/integration.repository';
import type { IntegrationCacheRepository } from '../repositories/integration-cache.repository';
import type { WorkspaceService } from './workspace.service';
import type { JiraProvider } from '../providers/jira/jira.provider';
import type { CircuitBreaker } from '../infrastructure/circuit-breaker';
import { CircuitOpenError } from '../infrastructure/circuit-breaker';
import { withRetry } from '../infrastructure/retry';
import type { SecureStorage } from '../infrastructure/safe-storage';
import type { PreferencesRepository } from '../repositories/preferences.repository';
import { JiraAuthProvider } from '../providers/jira/jira-auth';
import type { JiraOAuthTokens } from '../providers/jira/jira.types';
import { JIRA_RESOURCE_TYPES } from '../providers/jira/jira.types';
import type { JiraProject } from '../providers/jira/jira.types';

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

export class IntegrationService {
  constructor(
    private readonly integrationRepo: IntegrationRepository,
    private readonly cacheRepo: IntegrationCacheRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly jiraProvider: JiraProvider,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly secureStorage: SecureStorage,
    private readonly preferencesRepo: PreferencesRepository,
  ) {}

  async getIntegration(): Promise<Result<Integration | null, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      const integration = await this.integrationRepo.findByWorkspaceAndProvider(
        workspaceId,
        'jira',
      );
      return ok(integration);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to load integration', cause));
    }
  }

  async connectJira(
    clientId: string,
    clientSecret: string,
  ): Promise<Result<Integration, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      // 1. Run OAuth flow
      const authProvider = new JiraAuthProvider(clientId, clientSecret);
      const tokens = await authProvider.initiateOAuthFlow();

      // 2. Store tokens securely
      this.secureStorage.store(
        `jira_tokens_${workspaceId}`,
        JSON.stringify(tokens),
      );
      this.secureStorage.store(
        `jira_oauth_${workspaceId}`,
        JSON.stringify({ clientId, clientSecret }),
      );

      // 3. Fetch accessible resources
      const resources = await this.circuitBreaker.execute(() =>
        withRetry(() => this.jiraProvider.fetchAccessibleResources(tokens.accessToken)),
      );

      if (resources.length === 0) {
        return err(
          new DomainError(ERROR_CODES.JIRA_AUTH_FAILED, 'No accessible Jira sites found'),
        );
      }

      const site = resources[0]!;
      const config: JiraConfig = {
        cloudId: site.id,
        siteUrl: site.url,
        selectedProjectKeys: [],
      };

      // 4. Upsert integration record
      const existing = await this.integrationRepo.findByWorkspaceAndProvider(workspaceId, 'jira');
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
          'jira',
          config,
          'connected',
        );
      }

      return ok(integration);
    } catch (cause) {
      return err(this.mapJiraError(cause));
    }
  }

  async disconnect(): Promise<Result<void, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      this.secureStorage.remove(`jira_tokens_${workspaceId}`);
      this.secureStorage.remove(`jira_oauth_${workspaceId}`);

      const integration = await this.integrationRepo.findByWorkspaceAndProvider(
        workspaceId,
        'jira',
      );
      if (integration) {
        await this.cacheRepo.deleteByIntegration(integration.id);
        await this.integrationRepo.updateStatus(integration.id, 'disconnected');
      }

      return ok(undefined);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to disconnect integration', cause));
    }
  }

  async listProjects(): Promise<Result<JiraProject[], DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      const integration = await this.integrationRepo.findByWorkspaceAndProvider(
        workspaceId,
        'jira',
      );
      if (!integration || integration.status === 'disconnected') {
        return err(
          new DomainError(ERROR_CODES.JIRA_AUTH_FAILED, 'Jira is not connected'),
        );
      }

      const tokens = await this.getTokens(workspaceId);
      if (!tokens) {
        return err(new DomainError(ERROR_CODES.JIRA_AUTH_FAILED, 'Jira tokens not found'));
      }

      const projects = await this.circuitBreaker.execute(() =>
        withRetry(() =>
          this.jiraProvider.fetchProjects(integration.config.cloudId, tokens.accessToken),
        ),
      );

      return ok(projects);
    } catch (cause) {
      return err(this.mapJiraError(cause));
    }
  }

  async sync(
    projectKeys: string[],
  ): Promise<Result<{ syncedCount: number; warning?: string }, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    const integration = await this.integrationRepo.findByWorkspaceAndProvider(
      workspaceId,
      'jira',
    );
    if (!integration || integration.status === 'disconnected') {
      return err(new DomainError(ERROR_CODES.JIRA_AUTH_FAILED, 'Jira is not connected'));
    }

    // Update selected project keys
    const updatedConfig: JiraConfig = {
      ...integration.config,
      selectedProjectKeys: projectKeys,
    };
    await this.integrationRepo.updateConfig(integration.id, updatedConfig);

    let syncedCount = 0;
    let warning: string | undefined;

    try {
      const tokens = await this.getTokens(workspaceId);
      if (!tokens) {
        return err(new DomainError(ERROR_CODES.JIRA_AUTH_FAILED, 'Jira tokens not found'));
      }

      for (const projectKey of projectKeys) {
        // Fetch epics
        const epics = await this.fetchAllIssues(
          integration.config.cloudId,
          tokens.accessToken,
          `project = "${projectKey}" AND issuetype = Epic ORDER BY updated DESC`,
        );

        for (const epic of epics) {
          await this.cacheRepo.upsert(
            integration.id,
            JIRA_RESOURCE_TYPES.EPIC,
            epic.key,
            epic,
          );
          syncedCount++;

          // Fetch stories for this epic
          const stories = await this.fetchAllIssues(
            integration.config.cloudId,
            tokens.accessToken,
            `parent = "${epic.key}" ORDER BY updated DESC`,
          );

          for (const story of stories) {
            await this.cacheRepo.upsert(
              integration.id,
              JIRA_RESOURCE_TYPES.STORY,
              story.key,
              story,
            );
            syncedCount++;

            // Fetch comments for each story
            const comments = await this.fetchAllComments(
              integration.config.cloudId,
              tokens.accessToken,
              story.key,
            );

            for (const comment of comments) {
              await this.cacheRepo.upsert(
                integration.id,
                JIRA_RESOURCE_TYPES.COMMENT,
                `${story.key}_comment_${comment.id}`,
                { ...comment, issueKey: story.key },
              );
              syncedCount++;
            }
          }
        }
      }

      // Prune cache if needed
      await this.cacheRepo.pruneOldest(integration.id, 5000);

      // Update status and last synced
      await this.integrationRepo.updateStatus(integration.id, 'connected');
      await this.integrationRepo.updateLastSynced(integration.id);

      return ok({ syncedCount, warning });
    } catch (cause) {
      // On error: set status to error, return stale cache warning if available
      await this.integrationRepo.updateStatus(integration.id, 'error');

      const count = await this.cacheRepo.countByIntegration(integration.id);
      if (count > 0) {
        return ok({
          syncedCount,
          warning: `Sync partially failed: ${cause instanceof Error ? cause.message : 'Unknown error'}. Stale cached data is still available.`,
        });
      }

      return err(this.mapJiraError(cause));
    }
  }

  private async fetchAllIssues(
    cloudId: string,
    accessToken: string,
    jql: string,
  ): Promise<Array<{ key: string; [k: string]: unknown }>> {
    const allIssues: Array<{ key: string; [k: string]: unknown }> = [];
    let nextPageToken: string | undefined;

    while (true) {
      const response = await this.circuitBreaker.execute(() =>
        withRetry(() => this.jiraProvider.fetchIssues(cloudId, accessToken, jql, nextPageToken)),
      );

      for (const issue of response.issues) {
        allIssues.push(issue as unknown as { key: string; [k: string]: unknown });
      }

      if (!response.nextPageToken) break;
      nextPageToken = response.nextPageToken;
    }

    return allIssues;
  }

  private async fetchAllComments(
    cloudId: string,
    accessToken: string,
    issueKey: string,
  ): Promise<Array<{ id: string; [k: string]: unknown }>> {
    const allComments: Array<{ id: string; [k: string]: unknown }> = [];
    let startAt = 0;

    while (true) {
      const response = await this.circuitBreaker.execute(() =>
        withRetry(() =>
          this.jiraProvider.fetchComments(cloudId, accessToken, issueKey, startAt),
        ),
      );

      for (const comment of response.comments) {
        allComments.push(comment as unknown as { id: string; [k: string]: unknown });
      }

      if (startAt + response.maxResults >= response.total) break;
      startAt += response.maxResults;
    }

    return allComments;
  }

  private async getTokens(workspaceId: string): Promise<JiraOAuthTokens | null> {
    const raw = this.secureStorage.retrieve(`jira_tokens_${workspaceId}`);
    if (!raw) return null;

    const tokens = JSON.parse(raw) as JiraOAuthTokens;

    // Auto-refresh if expired or about to expire
    if (tokens.expiresAt - TOKEN_EXPIRY_BUFFER_MS < Date.now()) {
      const oauthRaw = this.secureStorage.retrieve(`jira_oauth_${workspaceId}`);
      if (!oauthRaw) return null;

      const { clientId, clientSecret } = JSON.parse(oauthRaw) as {
        clientId: string;
        clientSecret: string;
      };

      const authProvider = new JiraAuthProvider(clientId, clientSecret);
      const refreshed = await authProvider.refreshAccessToken(tokens.refreshToken);

      this.secureStorage.store(
        `jira_tokens_${workspaceId}`,
        JSON.stringify(refreshed),
      );

      return refreshed;
    }

    return tokens;
  }

  private mapJiraError(cause: unknown): DomainError {
    if (cause instanceof CircuitOpenError) {
      return new DomainError(ERROR_CODES.CIRCUIT_OPEN, 'Service temporarily unavailable', cause);
    }

    if (isHttpError(cause)) {
      if (cause.status === 401 || cause.status === 403) {
        return new DomainError(ERROR_CODES.JIRA_AUTH_FAILED, 'Jira authentication failed', cause);
      }
      if (cause.status === 429) {
        return new DomainError(
          ERROR_CODES.JIRA_RATE_LIMITED,
          'Rate limited by Jira — try again later',
          cause,
        );
      }
    }

    return new DomainError(
      ERROR_CODES.JIRA_FETCH_FAILED,
      cause instanceof Error ? cause.message : 'Failed to communicate with Jira',
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
