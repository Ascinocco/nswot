import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { Integration, ConfluenceConfig } from '../domain/types';
import type { IntegrationRepository } from '../repositories/integration.repository';
import type { IntegrationCacheRepository } from '../repositories/integration-cache.repository';
import type { WorkspaceService } from './workspace.service';
import type { ConfluenceProvider } from '../providers/confluence/confluence.provider';
import type { CircuitBreaker } from '../infrastructure/circuit-breaker';
import { CircuitOpenError } from '../infrastructure/circuit-breaker';
import { withRetry } from '../infrastructure/retry';
import type { SecureStorage } from '../infrastructure/safe-storage';
import type { ConfluenceSpace } from '../providers/confluence/confluence.types';
import { CONFLUENCE_RESOURCE_TYPES } from '../providers/confluence/confluence.types';
import type { JiraOAuthTokens } from '../providers/jira/jira.types';

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const MAX_PAGES_PER_SPACE = 200;

export class ConfluenceService {
  constructor(
    private readonly integrationRepo: IntegrationRepository,
    private readonly cacheRepo: IntegrationCacheRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly confluenceProvider: ConfluenceProvider,
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
        'confluence',
      );
      return ok(integration);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to load Confluence integration', cause));
    }
  }

  async connect(): Promise<Result<Integration, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      // Confluence reuses the Atlassian OAuth token from Jira
      const tokens = await this.getTokens(workspaceId);
      if (!tokens) {
        return err(
          new DomainError(
            ERROR_CODES.CONFLUENCE_AUTH_FAILED,
            'No Atlassian OAuth token available. Connect Jira first to share the Atlassian OAuth session.',
          ),
        );
      }

      // Get the Jira integration to read cloudId/siteUrl
      const jiraIntegration = await this.integrationRepo.findByWorkspaceAndProvider(
        workspaceId,
        'jira',
      );
      if (!jiraIntegration || jiraIntegration.status === 'disconnected') {
        return err(
          new DomainError(
            ERROR_CODES.CONFLUENCE_AUTH_FAILED,
            'Jira must be connected first. Confluence shares the Atlassian OAuth session.',
          ),
        );
      }

      const jiraConfig = jiraIntegration.config as { cloudId: string; siteUrl: string };

      // Verify we can access Confluence by fetching spaces
      await this.circuitBreaker.execute(() =>
        withRetry(() => this.confluenceProvider.fetchSpaces(jiraConfig.cloudId, tokens.accessToken)),
      );

      const config: ConfluenceConfig = {
        cloudId: jiraConfig.cloudId,
        siteUrl: jiraConfig.siteUrl,
        selectedSpaceKeys: [],
      };

      // Upsert integration record
      const existing = await this.integrationRepo.findByWorkspaceAndProvider(
        workspaceId,
        'confluence',
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
          'confluence',
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
      const integration = await this.integrationRepo.findByWorkspaceAndProvider(
        workspaceId,
        'confluence',
      );
      if (integration) {
        await this.cacheRepo.deleteByIntegration(integration.id);
        await this.integrationRepo.updateStatus(integration.id, 'disconnected');
      }

      return ok(undefined);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to disconnect Confluence', cause));
    }
  }

  async listSpaces(): Promise<Result<ConfluenceSpace[], DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      const integration = await this.integrationRepo.findByWorkspaceAndProvider(
        workspaceId,
        'confluence',
      );
      if (!integration || integration.status === 'disconnected') {
        return err(
          new DomainError(ERROR_CODES.CONFLUENCE_AUTH_FAILED, 'Confluence is not connected'),
        );
      }

      const tokens = await this.getTokens(workspaceId);
      if (!tokens) {
        return err(
          new DomainError(ERROR_CODES.CONFLUENCE_AUTH_FAILED, 'Atlassian tokens not found'),
        );
      }

      const config = integration.config as ConfluenceConfig;
      const allSpaces: ConfluenceSpace[] = [];
      let cursor: string | undefined;

      while (true) {
        const result = await this.circuitBreaker.execute(() =>
          withRetry(() =>
            this.confluenceProvider.fetchSpaces(config.cloudId, tokens.accessToken, cursor),
          ),
        );
        allSpaces.push(...result.spaces);
        if (!result.nextCursor) break;
        cursor = result.nextCursor;
      }

      return ok(allSpaces);
    } catch (cause) {
      return err(this.mapError(cause));
    }
  }

  async sync(
    spaceKeys: string[],
  ): Promise<Result<{ syncedCount: number; warning?: string }, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    const integration = await this.integrationRepo.findByWorkspaceAndProvider(
      workspaceId,
      'confluence',
    );
    if (!integration || integration.status === 'disconnected') {
      return err(
        new DomainError(ERROR_CODES.CONFLUENCE_AUTH_FAILED, 'Confluence is not connected'),
      );
    }

    const updatedConfig: ConfluenceConfig = {
      ...(integration.config as ConfluenceConfig),
      selectedSpaceKeys: spaceKeys,
    };
    await this.integrationRepo.updateConfig(integration.id, updatedConfig);

    let syncedCount = 0;

    try {
      const tokens = await this.getTokens(workspaceId);
      if (!tokens) {
        return err(
          new DomainError(ERROR_CODES.CONFLUENCE_AUTH_FAILED, 'Atlassian tokens not found'),
        );
      }

      const config = integration.config as ConfluenceConfig;

      // Fetch all spaces to map keys to IDs
      const allSpaces: ConfluenceSpace[] = [];
      let spaceCursor: string | undefined;
      while (true) {
        const result = await this.circuitBreaker.execute(() =>
          withRetry(() =>
            this.confluenceProvider.fetchSpaces(config.cloudId, tokens.accessToken, spaceCursor),
          ),
        );
        allSpaces.push(...result.spaces);
        if (!result.nextCursor) break;
        spaceCursor = result.nextCursor;
      }

      for (const spaceKey of spaceKeys) {
        const space = allSpaces.find((s) => s.key === spaceKey);
        if (!space) continue;

        // Fetch pages in this space (limited)
        const pages = await this.fetchAllPages(
          config.cloudId,
          tokens.accessToken,
          space.id,
          MAX_PAGES_PER_SPACE,
        );

        for (const page of pages) {
          await this.cacheRepo.upsert(
            integration.id,
            CONFLUENCE_RESOURCE_TYPES.PAGE,
            `${spaceKey}:${page.id}`,
            page,
          );
          syncedCount++;

          // Fetch comments for this page
          const comments = await this.fetchAllComments(
            config.cloudId,
            tokens.accessToken,
            page.id,
          );

          for (const comment of comments) {
            await this.cacheRepo.upsert(
              integration.id,
              CONFLUENCE_RESOURCE_TYPES.COMMENT,
              `${spaceKey}:${page.id}_comment_${comment.id}`,
              { ...comment, pageId: page.id, pageTitle: page.title },
            );
            syncedCount++;
          }
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

  private async fetchAllPages(
    cloudId: string,
    accessToken: string,
    spaceId: string,
    maxPages: number,
  ): Promise<Array<{ id: string; title: string; [k: string]: unknown }>> {
    const allPages: Array<{ id: string; title: string; [k: string]: unknown }> = [];
    let cursor: string | undefined;

    while (allPages.length < maxPages) {
      const result = await this.circuitBreaker.execute(() =>
        withRetry(() =>
          this.confluenceProvider.fetchPages(cloudId, accessToken, spaceId, cursor),
        ),
      );

      for (const page of result.pages) {
        allPages.push(page as unknown as { id: string; title: string; [k: string]: unknown });
        if (allPages.length >= maxPages) break;
      }

      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }

    return allPages;
  }

  private async fetchAllComments(
    cloudId: string,
    accessToken: string,
    pageId: string,
  ): Promise<Array<{ id: string; [k: string]: unknown }>> {
    const allComments: Array<{ id: string; [k: string]: unknown }> = [];
    let cursor: string | undefined;

    while (true) {
      const result = await this.circuitBreaker.execute(() =>
        withRetry(() =>
          this.confluenceProvider.fetchPageComments(cloudId, accessToken, pageId, cursor),
        ),
      );

      for (const comment of result.comments) {
        allComments.push(comment as unknown as { id: string; [k: string]: unknown });
      }

      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }

    return allComments;
  }

  private async getTokens(workspaceId: string): Promise<JiraOAuthTokens | null> {
    // Confluence shares the Atlassian OAuth tokens with Jira
    const raw = this.secureStorage.retrieve(`jira_tokens_${workspaceId}`);
    if (!raw) return null;

    const tokens = JSON.parse(raw) as JiraOAuthTokens;

    if (tokens.expiresAt - TOKEN_EXPIRY_BUFFER_MS < Date.now()) {
      // Token needs refresh — delegate to Jira's refresh mechanism
      // by importing JiraAuthProvider
      const oauthRaw = this.secureStorage.retrieve(`jira_oauth_${workspaceId}`);
      if (!oauthRaw) return null;

      const { clientId, clientSecret } = JSON.parse(oauthRaw) as {
        clientId: string;
        clientSecret: string;
      };

      const { JiraAuthProvider } = await import('../providers/jira/jira-auth');
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

  private mapError(cause: unknown): DomainError {
    if (cause instanceof CircuitOpenError) {
      return new DomainError(ERROR_CODES.CIRCUIT_OPEN, 'Service temporarily unavailable', cause);
    }

    if (isHttpError(cause)) {
      if (cause.status === 401 || cause.status === 403) {
        return new DomainError(
          ERROR_CODES.CONFLUENCE_AUTH_FAILED,
          'Confluence authentication failed',
          cause,
        );
      }
      if (cause.status === 429) {
        return new DomainError(
          ERROR_CODES.CONFLUENCE_RATE_LIMITED,
          'Rate limited by Confluence — try again later',
          cause,
        );
      }
    }

    return new DomainError(
      ERROR_CODES.CONFLUENCE_FETCH_FAILED,
      cause instanceof Error ? cause.message : 'Failed to communicate with Confluence',
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
