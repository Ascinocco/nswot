import type { ToolExecutionOutput } from '../../services/agent.service';
import type { IntegrationRepository } from '../../repositories/integration.repository';
import type { IntegrationCacheRepository } from '../../repositories/integration-cache.repository';
import type { ProfileRepository } from '../../repositories/profile.repository';
import type { WorkspaceService } from '../../services/workspace.service';
import type { IntegrationCacheEntry, Profile } from '../../domain/types';
import type { JiraIssue, JiraComment } from '../jira/jira.types';
import { JIRA_RESOURCE_TYPES } from '../jira/jira.types';
import type { ConfluencePage, ConfluenceComment } from '../confluence/confluence.types';
import { CONFLUENCE_RESOURCE_TYPES } from '../confluence/confluence.types';
import type { GitHubPR, GitHubIssue, GitHubPRComment } from '../github/github.types';
import { GITHUB_RESOURCE_TYPES } from '../github/github.types';
import type { CodebaseAnalysis } from '../codebase/codebase.types';
import { CODEBASE_RESOURCE_TYPES } from '../codebase/codebase.types';
import { extractTextFromAdf } from '../jira/adf';

/**
 * Read tool executor: fetches data from integration cache and profiles.
 *
 * Read tools query existing cached data — they do not call external APIs.
 * They return JSON summary strings that are fed back to the LLM as tool_result.
 * The LLM can then reason about the data and produce follow-up content.
 */
export class ReadExecutor {
  constructor(
    private readonly integrationRepo: IntegrationRepository,
    private readonly integrationCacheRepo: IntegrationCacheRepository,
    private readonly profileRepo: ProfileRepository,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async execute(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionOutput> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return { content: JSON.stringify({ error: 'No workspace is currently open' }) };
    }

    switch (toolName) {
      case 'fetch_jira_data':
        return this.fetchJiraData(workspaceId, input);
      case 'fetch_confluence_data':
        return this.fetchConfluenceData(workspaceId, input);
      case 'fetch_github_data':
        return this.fetchGithubData(workspaceId, input);
      case 'run_codebase_analysis':
        return this.fetchCodebaseData(workspaceId, input);
      case 'search_profiles':
        return this.searchProfiles(workspaceId, input);
      default:
        return { content: JSON.stringify({ error: `Unknown read tool: ${toolName}` }) };
    }
  }

  private async fetchJiraData(
    workspaceId: string,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionOutput> {
    const integration = await this.integrationRepo.findByWorkspaceAndProvider(workspaceId, 'jira');
    if (!integration || integration.status === 'disconnected') {
      return { content: JSON.stringify({ error: 'Jira integration is not connected. Ask the user to connect Jira in Settings.' }) };
    }

    const epics = await this.integrationCacheRepo.findByType(integration.id, JIRA_RESOURCE_TYPES.EPIC);
    const stories = await this.integrationCacheRepo.findByType(integration.id, JIRA_RESOURCE_TYPES.STORY);
    const comments = await this.integrationCacheRepo.findByType(integration.id, JIRA_RESOURCE_TYPES.COMMENT);

    if (epics.length === 0 && stories.length === 0) {
      return { content: JSON.stringify({ message: 'No Jira data found in cache. The user may need to sync their Jira projects.' }) };
    }

    const query = typeof input.query === 'string' ? input.query.toLowerCase() : null;

    const epicSummaries = epics
      .map((e) => summarizeJiraIssue(e))
      .filter((s) => !query || matchesQuery(s, query));

    const storySummaries = stories
      .map((e) => summarizeJiraIssue(e))
      .filter((s) => !query || matchesQuery(s, query));

    const commentSummaries = comments.slice(0, 50).map((e) => {
      const comment = e.data as JiraComment & { issueKey?: string };
      return {
        issueKey: comment.issueKey ?? 'unknown',
        body: truncate(extractTextFromAdf(comment.body), 200),
        created: comment.created ?? '',
      };
    });

    return {
      content: JSON.stringify({
        source: 'jira',
        epicCount: epicSummaries.length,
        storyCount: storySummaries.length,
        commentCount: commentSummaries.length,
        epics: epicSummaries.slice(0, 30),
        stories: storySummaries.slice(0, 50),
        comments: commentSummaries,
      }),
    };
  }

  private async fetchConfluenceData(
    workspaceId: string,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionOutput> {
    const integration = await this.integrationRepo.findByWorkspaceAndProvider(workspaceId, 'confluence');
    if (!integration || integration.status === 'disconnected') {
      return { content: JSON.stringify({ error: 'Confluence integration is not connected. Ask the user to connect Confluence in Settings.' }) };
    }

    const pages = await this.integrationCacheRepo.findByType(integration.id, CONFLUENCE_RESOURCE_TYPES.PAGE);
    const comments = await this.integrationCacheRepo.findByType(integration.id, CONFLUENCE_RESOURCE_TYPES.COMMENT);

    if (pages.length === 0) {
      return { content: JSON.stringify({ message: 'No Confluence data found in cache. The user may need to sync their Confluence spaces.' }) };
    }

    const query = typeof input.query === 'string' ? input.query.toLowerCase() : null;

    const pageSummaries = pages.map((e) => {
      const page = e.data as ConfluencePage;
      const bodyText = stripHtml(page.body?.storage?.value ?? '');
      return {
        id: page.id,
        title: page.title,
        excerpt: truncate(bodyText, 300),
        lastUpdated: page.lastUpdated ?? '',
      };
    }).filter((p) => !query || p.title.toLowerCase().includes(query) || p.excerpt.toLowerCase().includes(query));

    const commentSummaries = comments.slice(0, 30).map((e) => {
      const c = e.data as ConfluenceComment;
      return {
        pageId: c.pageId,
        body: truncate(stripHtml(c.body?.storage?.value ?? ''), 150),
        createdAt: c.createdAt,
      };
    });

    return {
      content: JSON.stringify({
        source: 'confluence',
        pageCount: pageSummaries.length,
        commentCount: commentSummaries.length,
        pages: pageSummaries.slice(0, 30),
        comments: commentSummaries,
      }),
    };
  }

  private async fetchGithubData(
    workspaceId: string,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionOutput> {
    const integration = await this.integrationRepo.findByWorkspaceAndProvider(workspaceId, 'github');
    if (!integration || integration.status === 'disconnected') {
      return { content: JSON.stringify({ error: 'GitHub integration is not connected. Ask the user to connect GitHub in Settings.' }) };
    }

    const prs = await this.integrationCacheRepo.findByType(integration.id, GITHUB_RESOURCE_TYPES.PR);
    const issues = await this.integrationCacheRepo.findByType(integration.id, GITHUB_RESOURCE_TYPES.ISSUE);
    const prComments = await this.integrationCacheRepo.findByType(integration.id, GITHUB_RESOURCE_TYPES.PR_COMMENT);

    if (prs.length === 0 && issues.length === 0) {
      return { content: JSON.stringify({ message: 'No GitHub data found in cache. The user may need to sync their GitHub repos.' }) };
    }

    const query = typeof input.query === 'string' ? input.query.toLowerCase() : null;

    const prSummaries = prs.map((e) => {
      const pr = e.data as GitHubPR;
      return {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        author: pr.user?.login ?? 'unknown',
        createdAt: pr.created_at,
        mergedAt: pr.merged_at,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changed_files,
        labels: pr.labels?.map((l) => l.name) ?? [],
      };
    }).filter((p) => !query || p.title.toLowerCase().includes(query));

    const issueSummaries = issues.map((e) => {
      const issue = e.data as GitHubIssue;
      return {
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.user?.login ?? 'unknown',
        createdAt: issue.created_at,
        labels: issue.labels?.map((l) => l.name) ?? [],
      };
    }).filter((i) => !query || i.title.toLowerCase().includes(query));

    const commentSummaries = prComments.slice(0, 30).map((e) => {
      const c = e.data as GitHubPRComment & { repoFullName?: string; prNumber?: number };
      return {
        prNumber: c.prNumber ?? null,
        body: truncate(c.body, 200),
        createdAt: c.created_at,
      };
    });

    return {
      content: JSON.stringify({
        source: 'github',
        prCount: prSummaries.length,
        issueCount: issueSummaries.length,
        commentCount: commentSummaries.length,
        pullRequests: prSummaries.slice(0, 30),
        issues: issueSummaries.slice(0, 30),
        comments: commentSummaries,
      }),
    };
  }

  private async fetchCodebaseData(
    workspaceId: string,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionOutput> {
    const integration = await this.integrationRepo.findByWorkspaceAndProvider(workspaceId, 'codebase');
    if (!integration) {
      return { content: JSON.stringify({ error: 'Codebase integration is not configured. Ask the user to set up codebase analysis in Settings.' }) };
    }

    const repos = Array.isArray(input.repos) ? input.repos as string[] : [];
    const config = integration.config as { selectedRepos?: string[] };
    const targetRepos = repos.length > 0 ? repos : (config.selectedRepos ?? []);

    if (targetRepos.length === 0) {
      return { content: JSON.stringify({ message: 'No codebase repos configured. The user needs to select repos for analysis.' }) };
    }

    const analyses: Array<{ repo: string; analysis: CodebaseAnalysis }> = [];
    for (const repo of targetRepos) {
      const entry = await this.integrationCacheRepo.findEntry(
        integration.id,
        CODEBASE_RESOURCE_TYPES.ANALYSIS,
        repo,
      );
      if (entry) {
        analyses.push({ repo, analysis: entry.data as CodebaseAnalysis });
      }
    }

    if (analyses.length === 0) {
      return { content: JSON.stringify({ message: 'No cached codebase analyses found. The user may need to run codebase analysis first.' }) };
    }

    const summaries = analyses.map(({ repo, analysis }) => ({
      repo,
      analyzedAt: analysis.analyzedAt,
      architecture: {
        summary: analysis.architecture.summary,
        moduleCount: analysis.architecture.modules.length,
        concerns: analysis.architecture.concerns,
      },
      quality: {
        summary: analysis.quality.summary,
        strengths: analysis.quality.strengths,
        weaknesses: analysis.quality.weaknesses,
      },
      technicalDebt: {
        summary: analysis.technicalDebt.summary,
        itemCount: analysis.technicalDebt.items.length,
        highSeverity: analysis.technicalDebt.items.filter((i) => i.severity === 'high').length,
      },
      risks: {
        summary: analysis.risks.summary,
        riskCount: analysis.risks.items.length,
      },
      jiraCrossReference: analysis.jiraCrossReference ? {
        summary: analysis.jiraCrossReference.summary,
        correlationCount: analysis.jiraCrossReference.correlations.length,
      } : null,
    }));

    return {
      content: JSON.stringify({
        source: 'codebase',
        repoCount: summaries.length,
        repos: summaries,
      }),
    };
  }

  private async searchProfiles(
    workspaceId: string,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionOutput> {
    const allProfiles = await this.profileRepo.findByWorkspace(workspaceId);

    if (allProfiles.length === 0) {
      return { content: JSON.stringify({ message: 'No profiles found in this workspace.' }) };
    }

    const query = typeof input.query === 'string' ? input.query.toLowerCase() : null;
    const tags = Array.isArray(input.tags) ? input.tags as string[] : [];

    let filtered = allProfiles;

    if (query) {
      filtered = filtered.filter((p) => profileMatchesQuery(p, query));
    }

    if (tags.length > 0) {
      const tagSet = new Set(tags.map((t) => t.toLowerCase()));
      filtered = filtered.filter((p) =>
        p.tags.some((t) => tagSet.has(t.toLowerCase())),
      );
    }

    const summaries = filtered.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      team: p.team,
      concerns: p.concerns,
      priorities: p.priorities,
      tags: p.tags,
      quoteCount: p.interviewQuotes.length,
      quotes: p.interviewQuotes.slice(0, 5).map((q) => truncate(q, 200)),
      notes: p.notes ? truncate(p.notes, 200) : null,
    }));

    return {
      content: JSON.stringify({
        source: 'profiles',
        totalProfiles: allProfiles.length,
        matchedProfiles: summaries.length,
        profiles: summaries,
      }),
    };
  }
}

// --- Helpers ---

function summarizeJiraIssue(entry: IntegrationCacheEntry): Record<string, unknown> {
  const issue = entry.data as JiraIssue;
  return {
    key: issue.key,
    summary: issue.fields?.summary ?? 'No summary',
    status: issue.fields?.status?.name ?? 'Unknown',
    priority: issue.fields?.priority?.name ?? null,
    type: issue.fields?.issuetype?.name ?? 'Unknown',
    labels: issue.fields?.labels ?? [],
    updated: issue.fields?.updated ?? '',
    epicKey: issue.fields?.parent?.key ?? null,
  };
}

function matchesQuery(obj: Record<string, unknown>, query: string): boolean {
  const text = JSON.stringify(obj).toLowerCase();
  return text.includes(query);
}

function profileMatchesQuery(p: Profile, query: string): boolean {
  return (
    p.name.toLowerCase().includes(query) ||
    (p.role?.toLowerCase().includes(query) ?? false) ||
    (p.team?.toLowerCase().includes(query) ?? false) ||
    (p.concerns?.toLowerCase().includes(query) ?? false) ||
    (p.priorities?.toLowerCase().includes(query) ?? false) ||
    p.tags.some((t) => t.toLowerCase().includes(query)) ||
    p.interviewQuotes.some((q) => q.toLowerCase().includes(query))
  );
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
