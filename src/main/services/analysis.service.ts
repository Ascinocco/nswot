import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type {
  Analysis,
  Profile,
  AnonymizedPayload,
  SwotOutput,
  SummariesOutput,
  IntegrationCacheEntry,
} from '../domain/types';
import type { JiraIssue, JiraComment } from '../providers/jira/jira.types';
import { JIRA_RESOURCE_TYPES } from '../providers/jira/jira.types';
import { extractTextFromAdf } from '../providers/jira/adf';
import type { ConfluencePage, ConfluenceComment } from '../providers/confluence/confluence.types';
import { CONFLUENCE_RESOURCE_TYPES } from '../providers/confluence/confluence.types';
import type { GitHubPR, GitHubIssue, GitHubPRComment } from '../providers/github/github.types';
import { GITHUB_RESOURCE_TYPES } from '../providers/github/github.types';
import type { AnalysisRepository } from '../repositories/analysis.repository';
import type { ProfileRepository } from '../repositories/profile.repository';
import type { IntegrationRepository } from '../repositories/integration.repository';
import { IntegrationCacheRepository } from '../repositories/integration-cache.repository';
import type { SettingsService } from './settings.service';
import type { WorkspaceService } from './workspace.service';
import { anonymizeProfiles, scrubIntegrationAuthors } from '../analysis/anonymizer';
import { buildSystemPrompt, buildUserPrompt, buildCorrectivePrompt, PROMPT_VERSION } from '../analysis/prompt-builder';
import type { PromptDataSources } from '../analysis/prompt-builder';
import { parseAnalysisResponse } from '../analysis/response-parser';
import { validateEvidence } from '../analysis/evidence-validator';
import { computeQualityMetrics } from '../analysis/quality-metrics';
import { calculateTokenBudget } from '../analysis/token-budget';
import type { ConnectedSource } from '../analysis/token-budget';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const LLM_TEMPERATURE = 0.2;
const LLM_MAX_TOKENS = 8192;

export type AnalysisStage =
  | 'collecting'
  | 'anonymizing'
  | 'building_prompt'
  | 'sending'
  | 'parsing'
  | 'validating'
  | 'storing'
  | 'completed'
  | 'failed';

export interface AnalysisProgress {
  analysisId: string;
  stage: AnalysisStage;
  message: string;
}

export interface RunAnalysisInput {
  profileIds: string[];
  jiraProjectKeys: string[];
  confluenceSpaceKeys: string[];
  githubRepos: string[];
  role: Analysis['role'];
  modelId: string;
  contextWindow: number;
}

export class AnalysisService {
  constructor(
    private readonly analysisRepo: AnalysisRepository,
    private readonly profileRepo: ProfileRepository,
    private readonly integrationRepo: IntegrationRepository,
    private readonly integrationCacheRepo: IntegrationCacheRepository,
    private readonly settingsService: SettingsService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async runAnalysis(
    input: RunAnalysisInput,
    onProgress: (progress: AnalysisProgress) => void,
  ): Promise<Result<Analysis, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    const apiKey = this.settingsService.getApiKey();
    if (!apiKey) {
      return err(new DomainError(ERROR_CODES.LLM_AUTH_FAILED, 'API key is not configured'));
    }

    if (input.profileIds.length === 0) {
      return err(new DomainError(ERROR_CODES.ANALYSIS_NO_PROFILES, 'At least one profile is required'));
    }

    // Create analysis record
    const analysis = await this.analysisRepo.insert({
      workspaceId,
      role: input.role,
      modelId: input.modelId,
      config: {
        profileIds: input.profileIds,
        jiraProjectKeys: input.jiraProjectKeys,
        confluenceSpaceKeys: input.confluenceSpaceKeys,
        githubRepos: input.githubRepos,
      },
    });

    try {
      await this.analysisRepo.updateStatus(analysis.id, 'running', {
        startedAt: new Date().toISOString(),
      });

      // Stage 1: Collect data
      onProgress({ analysisId: analysis.id, stage: 'collecting', message: 'Loading profiles and integration data...' });
      const profiles = await this.profileRepo.findByIds(input.profileIds);
      if (profiles.length === 0) {
        throw new DomainError(ERROR_CODES.ANALYSIS_NO_PROFILES, 'No profiles found for the selected IDs');
      }

      const jiraMarkdown = await this.collectJiraData(workspaceId, input.jiraProjectKeys);
      const rawConfluenceMarkdown = await this.collectConfluenceData(workspaceId, input.confluenceSpaceKeys);
      const confluenceMarkdown = rawConfluenceMarkdown ? scrubIntegrationAuthors(rawConfluenceMarkdown) : null;
      const rawGithubMarkdown = await this.collectGithubData(workspaceId, input.githubRepos);
      const githubMarkdown = rawGithubMarkdown ? scrubIntegrationAuthors(rawGithubMarkdown) : null;

      // Stage 2: Anonymize
      onProgress({ analysisId: analysis.id, stage: 'anonymizing', message: 'Anonymizing stakeholder data...' });
      const { anonymizedProfiles, pseudonymMap } = anonymizeProfiles(profiles);

      const inputSnapshot: AnonymizedPayload = {
        profiles: anonymizedProfiles,
        jiraData: jiraMarkdown ? { markdown: jiraMarkdown } : null,
        confluenceData: confluenceMarkdown ? { markdown: confluenceMarkdown } : null,
        githubData: githubMarkdown ? { markdown: githubMarkdown } : null,
        pseudonymMap,
      };

      await this.analysisRepo.updateStatus(analysis.id, 'running', { inputSnapshot });

      // Store analysis-profile junction records
      await this.analysisRepo.insertProfiles(
        analysis.id,
        anonymizedProfiles.map((ap, i) => ({
          analysisId: analysis.id,
          profileId: profiles[i]!.id,
          anonymizedLabel: ap.label,
        })),
      );

      // Stage 3: Build prompt
      onProgress({ analysisId: analysis.id, stage: 'building_prompt', message: 'Constructing analysis prompt...' });
      const connectedSources: ConnectedSource[] = [];
      if (jiraMarkdown) connectedSources.push('jira');
      if (confluenceMarkdown) connectedSources.push('confluence');
      if (githubMarkdown) connectedSources.push('github');
      const budget = calculateTokenBudget(input.contextWindow, connectedSources);
      const systemPrompt = buildSystemPrompt();
      const dataSources: PromptDataSources = {
        jiraDataMarkdown: jiraMarkdown,
        confluenceDataMarkdown: confluenceMarkdown,
        githubDataMarkdown: githubMarkdown,
      };
      const userPrompt = buildUserPrompt(input.role, anonymizedProfiles, dataSources, budget);

      // Stage 4: Send to LLM
      onProgress({ analysisId: analysis.id, stage: 'sending', message: 'Sending to LLM...' });
      let rawResponse = await this.callLlm(apiKey, input.modelId, systemPrompt, userPrompt);

      // Stage 5: Parse response
      onProgress({ analysisId: analysis.id, stage: 'parsing', message: 'Parsing LLM response...' });
      let parseResult = parseAnalysisResponse(rawResponse);

      // Corrective retry on first parse failure
      if (!parseResult.ok) {
        onProgress({ analysisId: analysis.id, stage: 'sending', message: 'Retrying with corrective prompt...' });
        const correctivePrompt = buildCorrectivePrompt(parseResult.error.message);
        rawResponse = await this.callLlmWithHistory(
          apiKey,
          input.modelId,
          systemPrompt,
          userPrompt,
          rawResponse,
          correctivePrompt,
        );

        onProgress({ analysisId: analysis.id, stage: 'parsing', message: 'Parsing corrected response...' });
        parseResult = parseAnalysisResponse(rawResponse);

        if (!parseResult.ok) {
          throw parseResult.error;
        }
      }

      const { swotOutput, summariesOutput } = parseResult.value;

      // Stage 6: Validate evidence
      onProgress({ analysisId: analysis.id, stage: 'validating', message: 'Validating evidence references...' });
      const validationResult = validateEvidence(swotOutput, inputSnapshot);
      let warning: string | undefined;

      if (validationResult.ok && !validationResult.value.valid) {
        warning = `Evidence validation warnings: ${validationResult.value.warnings.join('; ')}`;
      }
      if (!validationResult.ok) {
        throw validationResult.error;
      }

      // Compute quality metrics
      const qualityMetrics = computeQualityMetrics(swotOutput);

      // Stage 7: Store results
      onProgress({ analysisId: analysis.id, stage: 'storing', message: 'Storing results...' });
      await this.analysisRepo.storeResult(analysis.id, {
        swotOutput,
        summariesOutput,
        qualityMetrics,
        rawLlmResponse: rawResponse,
        warning,
      });

      onProgress({ analysisId: analysis.id, stage: 'completed', message: 'Analysis complete!' });

      const completed = await this.analysisRepo.findById(analysis.id);
      return ok(completed!);
    } catch (cause) {
      const error = cause instanceof DomainError
        ? cause
        : new DomainError(ERROR_CODES.LLM_REQUEST_FAILED, cause instanceof Error ? cause.message : 'Analysis failed');

      await this.analysisRepo.updateStatus(analysis.id, 'failed', {
        error: error.message,
        completedAt: new Date().toISOString(),
      });

      onProgress({ analysisId: analysis.id, stage: 'failed', message: error.message });
      return err(error);
    }
  }

  async getPayloadPreview(
    profileIds: string[],
    jiraProjectKeys: string[],
    confluenceSpaceKeys: string[],
    githubRepos: string[],
    role: Analysis['role'],
    contextWindow: number,
  ): Promise<Result<{ systemPrompt: string; userPrompt: string; tokenEstimate: number }, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      const profiles = await this.profileRepo.findByIds(profileIds);
      const { anonymizedProfiles } = anonymizeProfiles(profiles);
      const jiraMarkdown = await this.collectJiraData(workspaceId, jiraProjectKeys);
      const rawConfluence = await this.collectConfluenceData(workspaceId, confluenceSpaceKeys);
      const confluenceMarkdown = rawConfluence ? scrubIntegrationAuthors(rawConfluence) : null;
      const rawGithub = await this.collectGithubData(workspaceId, githubRepos);
      const githubMarkdown = rawGithub ? scrubIntegrationAuthors(rawGithub) : null;

      const previewSources: ConnectedSource[] = [];
      if (jiraMarkdown) previewSources.push('jira');
      if (confluenceMarkdown) previewSources.push('confluence');
      if (githubMarkdown) previewSources.push('github');
      const budget = calculateTokenBudget(contextWindow, previewSources);

      const systemPrompt = buildSystemPrompt();
      const dataSources: PromptDataSources = {
        jiraDataMarkdown: jiraMarkdown,
        confluenceDataMarkdown: confluenceMarkdown,
        githubDataMarkdown: githubMarkdown,
      };
      const userPrompt = buildUserPrompt(role, anonymizedProfiles, dataSources, budget);

      const totalChars = systemPrompt.length + userPrompt.length;
      const tokenEstimate = Math.ceil(totalChars / 4);

      return ok({ systemPrompt, userPrompt, tokenEstimate });
    } catch (cause) {
      return err(
        new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to build payload preview', cause),
      );
    }
  }

  private async collectJiraData(
    workspaceId: string,
    jiraProjectKeys: string[],
  ): Promise<string | null> {
    if (jiraProjectKeys.length === 0) return null;

    const integration = await this.integrationRepo.findByWorkspaceAndProvider(workspaceId, 'jira');
    if (!integration || integration.status === 'disconnected') return null;

    const epics = await this.integrationCacheRepo.findByType(
      integration.id,
      JIRA_RESOURCE_TYPES.EPIC,
    );
    const stories = await this.integrationCacheRepo.findByType(
      integration.id,
      JIRA_RESOURCE_TYPES.STORY,
    );
    const comments = await this.integrationCacheRepo.findByType(
      integration.id,
      JIRA_RESOURCE_TYPES.COMMENT,
    );

    // Check staleness
    const isStale = epics.length > 0 && IntegrationCacheRepository.isStale(epics[0]!);

    return formatJiraMarkdown(epics, stories, comments, jiraProjectKeys, isStale);
  }

  private async collectConfluenceData(
    workspaceId: string,
    confluenceSpaceKeys: string[],
  ): Promise<string | null> {
    if (confluenceSpaceKeys.length === 0) return null;

    const integration = await this.integrationRepo.findByWorkspaceAndProvider(workspaceId, 'confluence');
    if (!integration || integration.status === 'disconnected') return null;

    const pages = await this.integrationCacheRepo.findByType(
      integration.id,
      CONFLUENCE_RESOURCE_TYPES.PAGE,
    );
    const comments = await this.integrationCacheRepo.findByType(
      integration.id,
      CONFLUENCE_RESOURCE_TYPES.COMMENT,
    );

    if (pages.length === 0) return null;

    const isStale = IntegrationCacheRepository.isStale(pages[0]!);
    return formatConfluenceMarkdown(pages, comments, confluenceSpaceKeys, isStale);
  }

  private async collectGithubData(
    workspaceId: string,
    githubRepos: string[],
  ): Promise<string | null> {
    if (githubRepos.length === 0) return null;

    const integration = await this.integrationRepo.findByWorkspaceAndProvider(workspaceId, 'github');
    if (!integration || integration.status === 'disconnected') return null;

    const prs = await this.integrationCacheRepo.findByType(
      integration.id,
      GITHUB_RESOURCE_TYPES.PR,
    );
    const issues = await this.integrationCacheRepo.findByType(
      integration.id,
      GITHUB_RESOURCE_TYPES.ISSUE,
    );
    const prComments = await this.integrationCacheRepo.findByType(
      integration.id,
      GITHUB_RESOURCE_TYPES.PR_COMMENT,
    );

    if (prs.length === 0 && issues.length === 0) return null;

    const isStale = prs.length > 0
      ? IntegrationCacheRepository.isStale(prs[0]!)
      : issues.length > 0
        ? IntegrationCacheRepository.isStale(issues[0]!)
        : false;

    return formatGithubMarkdown(prs, issues, prComments, githubRepos, isStale);
  }

  private async callLlm(
    apiKey: string,
    modelId: string,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    return this.sendToOpenRouter(apiKey, modelId, messages);
  }

  private async callLlmWithHistory(
    apiKey: string,
    modelId: string,
    systemPrompt: string,
    userPrompt: string,
    previousResponse: string,
    correctivePrompt: string,
  ): Promise<string> {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: previousResponse },
      { role: 'user', content: correctivePrompt },
    ];
    return this.sendToOpenRouter(apiKey, modelId, messages);
  }

  private async sendToOpenRouter(
    apiKey: string,
    modelId: string,
    messages: Array<{ role: string; content: string }>,
  ): Promise<string> {
    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://nswot.app',
        'X-Title': 'nswot',
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: LLM_TEMPERATURE,
        max_tokens: LLM_MAX_TOKENS,
        stream: false,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) {
        throw new DomainError(ERROR_CODES.LLM_AUTH_FAILED, 'Invalid API key');
      }
      if (status === 429) {
        throw new DomainError(ERROR_CODES.LLM_RATE_LIMITED, 'Rate limited by OpenRouter');
      }
      throw new DomainError(ERROR_CODES.LLM_REQUEST_FAILED, `OpenRouter returned status ${status}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      const errorMsg = body.error?.message ?? 'Empty response from LLM';
      throw new DomainError(ERROR_CODES.LLM_EMPTY_RESPONSE, errorMsg);
    }

    return content;
  }
}

function formatJiraMarkdown(
  epics: IntegrationCacheEntry[],
  stories: IntegrationCacheEntry[],
  comments: IntegrationCacheEntry[],
  projectKeys: string[],
  isStale: boolean,
): string {
  const sections: string[] = [];

  if (isStale) {
    sections.push('> **Note:** Jira data may be stale. Consider re-syncing for the latest information.\n');
  }

  sections.push(`Projects: ${projectKeys.join(', ')}\n`);

  // Epics
  sections.push('### Epics\n');
  if (epics.length === 0) {
    sections.push('No epics found.\n');
  } else {
    for (const entry of epics) {
      const issue = entry.data as JiraIssue;
      const status = issue.fields?.status?.name ?? 'Unknown';
      const updated = issue.fields?.updated ?? '';
      const descText = extractTextFromAdf(issue.fields?.description);
      const desc = descText
        ? `\n  Description: ${truncate(descText, 200)}`
        : '';
      sections.push(`- [${issue.key}] ${issue.fields?.summary ?? 'No summary'} (Status: ${status}, Updated: ${updated})${desc}`);
    }
    sections.push('');
  }

  // Stories
  sections.push('### Stories (Recent, by priority)\n');
  if (stories.length === 0) {
    sections.push('No stories found.\n');
  } else {
    for (const entry of stories) {
      const issue = entry.data as JiraIssue;
      const status = issue.fields?.status?.name ?? 'Unknown';
      const priority = issue.fields?.priority?.name ?? 'None';
      const epicKey = issue.fields?.parent?.key ?? 'None';
      sections.push(`- [${issue.key}] ${issue.fields?.summary ?? 'No summary'} (Status: ${status}, Epic: ${epicKey}, Priority: ${priority})`);
    }
    sections.push('');
  }

  // Comments
  if (comments.length > 0) {
    sections.push('### Notable Comments\n');
    for (const entry of comments) {
      const comment = entry.data as JiraComment & { issueKey?: string };
      const issueKey = comment.issueKey ?? 'Unknown';
      const body = truncate(extractTextFromAdf(comment.body), 200);
      const created = comment.created ?? '';
      sections.push(`- On [${issueKey}]: "${body}" (${created})`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

function formatConfluenceMarkdown(
  pages: IntegrationCacheEntry[],
  comments: IntegrationCacheEntry[],
  spaceKeys: string[],
  isStale: boolean,
): string {
  const sections: string[] = [];

  if (isStale) {
    sections.push('> **Note:** Confluence data may be stale. Consider re-syncing for the latest information.\n');
  }

  sections.push(`Spaces: ${spaceKeys.join(', ')}\n`);

  // Group comments by page ID for easier lookup
  const commentsByPage = new Map<string, IntegrationCacheEntry[]>();
  for (const entry of comments) {
    const comment = entry.data as ConfluenceComment;
    const existing = commentsByPage.get(comment.pageId) ?? [];
    existing.push(entry);
    commentsByPage.set(comment.pageId, existing);
  }

  // Pages
  sections.push('### Pages\n');
  if (pages.length === 0) {
    sections.push('No pages found.\n');
  } else {
    for (const entry of pages) {
      const page = entry.data as ConfluencePage;
      const bodyHtml = page.body?.storage?.value ?? '';
      // Strip HTML tags for a plain-text excerpt
      const bodyText = stripHtml(bodyHtml);
      const excerpt = bodyText ? `\n  Excerpt: ${truncate(bodyText, 300)}` : '';
      const updated = page.lastUpdated ?? '';
      sections.push(`- [${page.title}] (ID: ${page.id}, Updated: ${updated})${excerpt}`);

      // Include page comments inline
      const pageComments = commentsByPage.get(page.id);
      if (pageComments && pageComments.length > 0) {
        for (const cEntry of pageComments) {
          const c = cEntry.data as ConfluenceComment;
          const cBody = stripHtml(c.body?.storage?.value ?? '');
          if (cBody) {
            sections.push(`  - Comment: "${truncate(cBody, 150)}" (${c.createdAt})`);
          }
        }
      }
    }
    sections.push('');
  }

  return sections.join('\n');
}

function formatGithubMarkdown(
  prs: IntegrationCacheEntry[],
  issues: IntegrationCacheEntry[],
  prComments: IntegrationCacheEntry[],
  repos: string[],
  isStale: boolean,
): string {
  const sections: string[] = [];

  if (isStale) {
    sections.push('> **Note:** GitHub data may be stale. Consider re-syncing for the latest information.\n');
  }

  sections.push(`Repositories: ${repos.join(', ')}\n`);

  // Group PR comments by PR number + repo
  const commentsByPr = new Map<string, IntegrationCacheEntry[]>();
  for (const entry of prComments) {
    const comment = entry.data as GitHubPRComment & { repoFullName?: string; prNumber?: number };
    const key = `${comment.repoFullName ?? ''}#${comment.prNumber ?? ''}`;
    const existing = commentsByPr.get(key) ?? [];
    existing.push(entry);
    commentsByPr.set(key, existing);
  }

  // Pull Requests
  sections.push('### Pull Requests\n');
  if (prs.length === 0) {
    sections.push('No pull requests found.\n');
  } else {
    for (const entry of prs) {
      const pr = entry.data as GitHubPR & { repoFullName?: string };
      const repo = pr.repoFullName ?? '';
      const state = pr.merged_at ? 'merged' : pr.state;
      const labels = pr.labels.map((l) => l.name).join(', ');
      const labelStr = labels ? ` [${labels}]` : '';
      const body = pr.body ? `\n  Description: ${truncate(pr.body, 200)}` : '';
      sections.push(
        `- [${repo}#${pr.number}] ${pr.title} (State: ${state}, +${pr.additions}/-${pr.deletions}, ${pr.changed_files} files)${labelStr}${body}`,
      );

      // Include PR review comments
      const prKey = `${repo}#${pr.number}`;
      const relatedComments = commentsByPr.get(prKey);
      if (relatedComments && relatedComments.length > 0) {
        for (const cEntry of relatedComments.slice(0, 5)) {
          const c = cEntry.data as GitHubPRComment;
          const file = c.path ? ` on ${c.path}` : '';
          sections.push(`  - Review comment${file}: "${truncate(c.body, 150)}" (${c.created_at})`);
        }
      }
    }
    sections.push('');
  }

  // Issues
  sections.push('### Issues\n');
  if (issues.length === 0) {
    sections.push('No issues found.\n');
  } else {
    for (const entry of issues) {
      const issue = entry.data as GitHubIssue & { repoFullName?: string };
      const repo = issue.repoFullName ?? '';
      const labels = issue.labels.map((l) => l.name).join(', ');
      const labelStr = labels ? ` [${labels}]` : '';
      const body = issue.body ? `\n  Description: ${truncate(issue.body, 200)}` : '';
      sections.push(
        `- [${repo}#${issue.number}] ${issue.title} (State: ${issue.state}, Created: ${issue.created_at})${labelStr}${body}`,
      );
    }
    sections.push('');
  }

  return sections.join('\n');
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}
