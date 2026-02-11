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
  // Extract from jiraData if it's available and structured
  if (snapshot.jiraData && typeof snapshot.jiraData === 'object') {
    extractJiraSourceIds(snapshot.jiraData, ids);
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
