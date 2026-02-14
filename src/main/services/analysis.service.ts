import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import { Logger } from '../infrastructure/logger';
import type {
  Analysis,
  Profile,
  AnonymizedPayload,
  IntegrationCacheEntry,
} from '../domain/types';
import type { JiraIssue, JiraComment } from '../providers/jira/jira.types';
import { JIRA_RESOURCE_TYPES } from '../providers/jira/jira.types';
import { extractTextFromAdf } from '../providers/jira/adf';
import type { ConfluencePage, ConfluenceComment } from '../providers/confluence/confluence.types';
import { CONFLUENCE_RESOURCE_TYPES } from '../providers/confluence/confluence.types';
import type { GitHubPR, GitHubIssue, GitHubPRComment } from '../providers/github/github.types';
import { GITHUB_RESOURCE_TYPES } from '../providers/github/github.types';
import type { CodebaseAnalysis } from '../providers/codebase/codebase.types';
import { CODEBASE_RESOURCE_TYPES } from '../providers/codebase/codebase.types';
import type { AnalysisRepository } from '../repositories/analysis.repository';
import type { ProfileRepository } from '../repositories/profile.repository';
import type { IntegrationRepository } from '../repositories/integration.repository';
import { IntegrationCacheRepository } from '../repositories/integration-cache.repository';
import type { SettingsService } from './settings.service';
import type { WorkspaceService } from './workspace.service';
import { anonymizeProfiles, scrubIntegrationAuthors } from '../analysis/anonymizer';
import { buildSystemPrompt, buildUserPrompt } from '../analysis/prompt-builder';
import type { PromptDataSources } from '../analysis/prompt-builder';
import { calculateTokenBudget } from '../analysis/token-budget';
import type { ConnectedSource } from '../analysis/token-budget';
import { AnalysisOrchestrator } from '../analysis/orchestrator';
import { SwotGenerationStep } from '../analysis/steps/swot-generation';
import { ExtractionStep } from '../analysis/steps/extraction';
import { SynthesisStep } from '../analysis/steps/synthesis';
import type { LlmCaller, LlmResponse } from '../analysis/pipeline-step';
import type { LLMProvider } from '../providers/llm/llm-provider.interface';

const LLM_TEMPERATURE = 0;
const LLM_MAX_TOKENS = 16384;

export type AnalysisStage =
  | 'collecting'
  | 'anonymizing'
  | 'extracting'
  | 'synthesizing'
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
  codebaseRepos: string[];
  role: Analysis['role'];
  modelId: string;
  contextWindow: number;
  multiStep?: boolean;
  conversationId?: string;
  parentAnalysisId?: string;
}

export interface RunAnalysisInChatInput extends RunAnalysisInput {
  conversationId: string;
  parentAnalysisId?: string;
}

export class AnalysisService {
  constructor(
    private readonly analysisRepo: AnalysisRepository,
    private readonly profileRepo: ProfileRepository,
    private readonly integrationRepo: IntegrationRepository,
    private readonly integrationCacheRepo: IntegrationCacheRepository,
    private readonly settingsService: SettingsService,
    private readonly workspaceService: WorkspaceService,
    private readonly llmProvider?: LLMProvider,
  ) {}

  async runAnalysis(
    input: RunAnalysisInput,
    onProgress: (progress: AnalysisProgress) => void,
  ): Promise<Result<Analysis, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    const apiKey = this.settingsService.getActiveApiKey();
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
        codebaseRepos: input.codebaseRepos,
      },
      conversationId: input.conversationId,
      parentAnalysisId: input.parentAnalysisId,
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
      const codebaseMarkdown = await this.collectCodebaseData(workspaceId, input.codebaseRepos);

      // Stage 2: Anonymize
      onProgress({ analysisId: analysis.id, stage: 'anonymizing', message: 'Anonymizing stakeholder data...' });
      const { anonymizedProfiles, pseudonymMap } = anonymizeProfiles(profiles);

      const inputSnapshot: AnonymizedPayload = {
        profiles: anonymizedProfiles,
        jiraData: jiraMarkdown ? { markdown: jiraMarkdown } : null,
        confluenceData: confluenceMarkdown ? { markdown: confluenceMarkdown } : null,
        githubData: githubMarkdown ? { markdown: githubMarkdown } : null,
        codebaseData: codebaseMarkdown ? { markdown: codebaseMarkdown } : null,
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

      // Stages 3-6: Run analysis pipeline (build prompt → LLM → parse → validate)
      const connectedSources: ConnectedSource[] = [];
      if (jiraMarkdown) connectedSources.push('jira');
      if (confluenceMarkdown) connectedSources.push('confluence');
      if (githubMarkdown) connectedSources.push('github');
      if (codebaseMarkdown) connectedSources.push('codebase');

      const dataSources: PromptDataSources = {
        jiraDataMarkdown: jiraMarkdown,
        confluenceDataMarkdown: confluenceMarkdown,
        githubDataMarkdown: githubMarkdown,
        codebaseDataMarkdown: codebaseMarkdown,
      };

      const llmCaller: LlmCaller = {
        call: async (messages, modelId, onToken) => {
          if (this.llmProvider) {
            const resp = await this.llmProvider.createChatCompletion({
              apiKey,
              modelId,
              messages,
              temperature: LLM_TEMPERATURE,
              maxTokens: LLM_MAX_TOKENS,
              onToken,
            });
            return { content: resp.content, finishReason: resp.finishReason };
          }
          throw new DomainError(ERROR_CODES.LLM_REQUEST_FAILED, 'No LLM provider configured');
        },
      };

      const steps = input.multiStep
        ? [new ExtractionStep(), new SynthesisStep(), new SwotGenerationStep()]
        : [new SwotGenerationStep()];
      const orchestrator = new AnalysisOrchestrator(steps);
      const pipelineResult = await orchestrator.run(
        {
          analysisId: analysis.id,
          role: input.role,
          modelId: input.modelId,
          contextWindow: input.contextWindow,
          anonymizedProfiles,
          inputSnapshot,
          dataSources,
          connectedSources,
          llmCaller,
        },
        (stage, message) => {
          onProgress({ analysisId: analysis.id, stage: stage as AnalysisStage, message });
        },
      );

      // Stage 7: Store results
      onProgress({ analysisId: analysis.id, stage: 'storing', message: 'Storing results...' });
      await this.analysisRepo.storeResult(analysis.id, {
        swotOutput: pipelineResult.swotOutput!,
        summariesOutput: pipelineResult.summariesOutput!,
        qualityMetrics: pipelineResult.qualityMetrics!,
        rawLlmResponse: pipelineResult.rawLlmResponse!,
        warning: pipelineResult.warning,
      });

      onProgress({ analysisId: analysis.id, stage: 'completed', message: 'Analysis complete!' });

      const completed = await this.analysisRepo.findById(analysis.id);
      return ok(completed!);
    } catch (cause) {
      const error = cause instanceof DomainError
        ? cause
        : new DomainError(ERROR_CODES.LLM_REQUEST_FAILED, cause instanceof Error ? cause.message : 'Analysis failed');

      try {
        await this.analysisRepo.updateStatus(analysis.id, 'failed', {
          error: error.message,
          completedAt: new Date().toISOString(),
        });
      } catch (statusUpdateError) {
        // Log the status update failure but still return the original error
        Logger.tryGetInstance()?.error('Failed to update analysis status to failed', {
          analysisId: analysis.id,
          originalError: error.message,
          statusUpdateError: statusUpdateError instanceof Error ? statusUpdateError.message : 'unknown',
        });
      }

      onProgress({ analysisId: analysis.id, stage: 'failed', message: error.message });
      return err(error);
    }
  }

  /**
   * Run an analysis linked to a conversation. Delegates to runAnalysis()
   * — the conversationId/parentAnalysisId fields are already part of RunAnalysisInput.
   */
  async runAnalysisInChat(
    input: RunAnalysisInChatInput,
    onProgress: (progress: AnalysisProgress) => void,
  ): Promise<Result<Analysis, DomainError>> {
    return this.runAnalysis(input, onProgress);
  }

  async getPayloadPreview(
    profileIds: string[],
    jiraProjectKeys: string[],
    confluenceSpaceKeys: string[],
    githubRepos: string[],
    codebaseRepos: string[],
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
      const codebaseMarkdown = await this.collectCodebaseData(workspaceId, codebaseRepos);

      const previewSources: ConnectedSource[] = [];
      if (jiraMarkdown) previewSources.push('jira');
      if (confluenceMarkdown) previewSources.push('confluence');
      if (githubMarkdown) previewSources.push('github');
      if (codebaseMarkdown) previewSources.push('codebase');
      const budget = calculateTokenBudget(contextWindow, previewSources);

      const systemPrompt = buildSystemPrompt();
      const dataSources: PromptDataSources = {
        jiraDataMarkdown: jiraMarkdown,
        confluenceDataMarkdown: confluenceMarkdown,
        githubDataMarkdown: githubMarkdown,
        codebaseDataMarkdown: codebaseMarkdown,
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

  private async collectCodebaseData(
    workspaceId: string,
    codebaseRepos: string[],
  ): Promise<string | null> {
    if (codebaseRepos.length === 0) return null;

    const integration = await this.integrationRepo.findByWorkspaceAndProvider(workspaceId, 'codebase');
    if (!integration) return null;

    const analyses: CodebaseAnalysis[] = [];
    for (const repo of codebaseRepos) {
      const entry = await this.integrationCacheRepo.findEntry(
        integration.id,
        CODEBASE_RESOURCE_TYPES.ANALYSIS,
        repo,
      );
      if (entry) {
        analyses.push(entry.data as CodebaseAnalysis);
      }
    }

    if (analyses.length === 0) return null;

    return formatCodebaseMarkdown(analyses);
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
      const repo = pr.repoFullName ?? repoFromResourceId(entry.resourceId);
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
      const repo = issue.repoFullName ?? repoFromResourceId(entry.resourceId);
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

function formatCodebaseMarkdown(analyses: CodebaseAnalysis[]): string {
  const sections: string[] = [];

  for (const analysis of analyses) {
    sections.push(`### [${analysis.repo}]\n`);

    sections.push(`**Architecture**: ${analysis.architecture.summary}`);
    if (analysis.architecture.modules.length > 0) {
      sections.push(`- Modules: ${analysis.architecture.modules.join(', ')}`);
    }
    if (analysis.architecture.concerns.length > 0) {
      sections.push(`- Concerns: ${analysis.architecture.concerns.join(', ')}`);
    }
    sections.push('');

    sections.push(`**Code Quality**: ${analysis.quality.summary}`);
    if (analysis.quality.strengths.length > 0) {
      sections.push(`- Strengths: ${analysis.quality.strengths.join(', ')}`);
    }
    if (analysis.quality.weaknesses.length > 0) {
      sections.push(`- Weaknesses: ${analysis.quality.weaknesses.join(', ')}`);
    }
    sections.push('');

    sections.push(`**Technical Debt**: ${analysis.technicalDebt.summary}`);
    for (const item of analysis.technicalDebt.items) {
      sections.push(`- [${item.severity}] ${item.description} (${item.location})`);
    }
    sections.push('');

    sections.push(`**Risks**: ${analysis.risks.summary}`);
    for (const item of analysis.risks.items) {
      sections.push(`- ${item}`);
    }

    if (analysis.jiraCrossReference) {
      sections.push('');
      sections.push(`**Jira Cross-Reference**: ${analysis.jiraCrossReference.summary}`);
      for (const corr of analysis.jiraCrossReference.correlations) {
        sections.push(`- ${corr}`);
      }
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

/** Extract "owner/repo" from a resourceId like "owner/repo#123" */
function repoFromResourceId(resourceId: string): string {
  const hashIdx = resourceId.indexOf('#');
  return hashIdx > 0 ? resourceId.slice(0, hashIdx) : '';
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}
