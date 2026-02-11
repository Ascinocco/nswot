import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { SwotOutput, AnonymizedPayload } from '../domain/types';

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

export function validateEvidence(
  swotOutput: SwotOutput,
  inputSnapshot: AnonymizedPayload,
): Result<ValidationResult, DomainError> {
  const validSourceIds = buildValidSourceIds(inputSnapshot);
  const warnings: string[] = [];
  const quadrants = ['strengths', 'weaknesses', 'opportunities', 'threats'] as const;

  for (const quadrant of quadrants) {
    const items = swotOutput[quadrant];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;

      if (item.evidence.length === 0) {
        return err(
          new DomainError(
            ERROR_CODES.LLM_EVIDENCE_INVALID,
            `${quadrant}[${i}] "${item.claim}" has no evidence entries`,
          ),
        );
      }

      for (let j = 0; j < item.evidence.length; j++) {
        const evidence = item.evidence[j]!;
        if (!validSourceIds.has(evidence.sourceId)) {
          warnings.push(
            `${quadrant}[${i}].evidence[${j}]: sourceId "${evidence.sourceId}" not found in input snapshot`,
          );
        }
      }
    }
  }

  return ok({ valid: warnings.length === 0, warnings });
}

function buildValidSourceIds(snapshot: AnonymizedPayload): Set<string> {
  const ids = new Set<string>();

  for (const profile of snapshot.profiles) {
    ids.add(`profile:${profile.label}`);
  }

  // Jira source IDs are of the form "jira:PROJ-123"
  if (snapshot.jiraData && typeof snapshot.jiraData === 'object') {
    extractJiraSourceIds(snapshot.jiraData, ids);
  }

  // Confluence source IDs are of the form "confluence:page-title" or "confluence:page-id"
  if (snapshot.confluenceData && typeof snapshot.confluenceData === 'object') {
    extractConfluenceSourceIds(snapshot.confluenceData, ids);
  }

  // GitHub source IDs are of the form "github:owner/repo#123"
  if (snapshot.githubData && typeof snapshot.githubData === 'object') {
    extractGithubSourceIds(snapshot.githubData, ids);
  }

  return ids;
}

function extractJiraSourceIds(jiraData: unknown, ids: Set<string>): void {
  if (!jiraData || typeof jiraData !== 'object') return;
  const data = jiraData as Record<string, unknown>;

  const collections = ['epics', 'stories', 'comments', 'changelog'] as const;
  for (const collection of collections) {
    const items = data[collection];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (typeof item === 'object' && item !== null) {
        const record = item as Record<string, unknown>;
        const key = record['key'] ?? record['issueKey'];
        if (typeof key === 'string') {
          ids.add(`jira:${key}`);
        }
      }
    }
  }
}

function extractConfluenceSourceIds(confluenceData: unknown, ids: Set<string>): void {
  if (!confluenceData || typeof confluenceData !== 'object') return;
  const data = confluenceData as Record<string, unknown>;

  const collections = ['pages', 'comments'] as const;
  for (const collection of collections) {
    const items = data[collection];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (typeof item === 'object' && item !== null) {
        const record = item as Record<string, unknown>;
        const id = record['id'];
        const title = record['title'] ?? record['pageTitle'];
        if (typeof title === 'string') {
          ids.add(`confluence:${title}`);
        }
        if (typeof id === 'string') {
          ids.add(`confluence:${id}`);
        }
      }
    }
  }
}

function extractGithubSourceIds(githubData: unknown, ids: Set<string>): void {
  if (!githubData || typeof githubData !== 'object') return;
  const data = githubData as Record<string, unknown>;

  const collections = ['prs', 'issues', 'prComments'] as const;
  for (const collection of collections) {
    const items = data[collection];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (typeof item === 'object' && item !== null) {
        const record = item as Record<string, unknown>;
        const fullName = record['repoFullName'] ?? record['full_name'];
        const number = record['number'] ?? record['prNumber'];
        if (typeof fullName === 'string' && (typeof number === 'number' || typeof number === 'string')) {
          ids.add(`github:${fullName}#${number}`);
        }
      }
    }
  }
}
