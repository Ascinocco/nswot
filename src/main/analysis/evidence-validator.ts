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

function getMarkdown(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (typeof record['markdown'] === 'string') return record['markdown'];
  return null;
}

function extractJiraSourceIds(jiraData: unknown, ids: Set<string>): void {
  const markdown = getMarkdown(jiraData);
  if (!markdown) return;

  // Markdown format: "- [PROJ-123] Summary..." and "On [PROJ-123]: ..."
  const pattern = /\[([A-Z][A-Z0-9]+-\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    ids.add(`jira:${match[1]}`);
  }
}

function extractConfluenceSourceIds(confluenceData: unknown, ids: Set<string>): void {
  const markdown = getMarkdown(confluenceData);
  if (!markdown) return;

  // Markdown format: "- [Page Title] (ID: abc123, Updated: ...)"
  const pattern = /- \[(.+?)\] \(ID: (\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    ids.add(`confluence:${match[1]}`);
    ids.add(`confluence:${match[2]}`);
  }
}

function extractGithubSourceIds(githubData: unknown, ids: Set<string>): void {
  const markdown = getMarkdown(githubData);
  if (!markdown) return;

  // Markdown format: "- [owner/repo#123] Title..."
  const pattern = /\[([^\]]+#\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    ids.add(`github:${match[1]}`);
  }
}
