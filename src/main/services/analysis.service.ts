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
import type { AnalysisRepository } from '../repositories/analysis.repository';
import type { ProfileRepository } from '../repositories/profile.repository';
import type { IntegrationRepository } from '../repositories/integration.repository';
import { IntegrationCacheRepository } from '../repositories/integration-cache.repository';
import type { SettingsService } from './settings.service';
import type { WorkspaceService } from './workspace.service';
import { anonymizeProfiles } from '../analysis/anonymizer';
import { buildSystemPrompt, buildUserPrompt, buildCorrectivePrompt, PROMPT_VERSION } from '../analysis/prompt-builder';
import { parseAnalysisResponse } from '../analysis/response-parser';
import { validateEvidence } from '../analysis/evidence-validator';
import { calculateTokenBudget } from '../analysis/token-budget';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const LLM_TEMPERATURE = 0.2;
const LLM_MAX_TOKENS = 4096;

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
      },
    });

    try {
      await this.analysisRepo.updateStatus(analysis.id, 'running', {
        startedAt: new Date().toISOString(),
      });

      // Stage 1: Collect data
      onProgress({ analysisId: analysis.id, stage: 'collecting', message: 'Loading profiles and Jira data...' });
      const profiles = await this.profileRepo.findByIds(input.profileIds);
      if (profiles.length === 0) {
        throw new DomainError(ERROR_CODES.ANALYSIS_NO_PROFILES, 'No profiles found for the selected IDs');
      }

      const jiraMarkdown = await this.collectJiraData(workspaceId, input.jiraProjectKeys);

      // Stage 2: Anonymize
      onProgress({ analysisId: analysis.id, stage: 'anonymizing', message: 'Anonymizing stakeholder data...' });
      const { anonymizedProfiles, pseudonymMap } = anonymizeProfiles(profiles);

      const inputSnapshot: AnonymizedPayload = {
        profiles: anonymizedProfiles,
        jiraData: jiraMarkdown ? { markdown: jiraMarkdown } : null,
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
      const budget = calculateTokenBudget(input.contextWindow);
      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(input.role, anonymizedProfiles, jiraMarkdown, budget);

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

      // Stage 7: Store results
      onProgress({ analysisId: analysis.id, stage: 'storing', message: 'Storing results...' });
      await this.analysisRepo.storeResult(analysis.id, {
        swotOutput,
        summariesOutput,
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
      const budget = calculateTokenBudget(contextWindow);

      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(role, anonymizedProfiles, jiraMarkdown, budget);

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
      const desc = issue.fields?.description
        ? `\n  Description: ${truncate(issue.fields.description, 200)}`
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
      const body = truncate(comment.body ?? '', 200);
      const created = comment.created ?? '';
      sections.push(`- On [${issueKey}]: "${body}" (${created})`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}
