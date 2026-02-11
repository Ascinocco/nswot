import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { SwotOutput, SummariesOutput, SwotItem, EvidenceEntry, EvidenceSourceType } from '../domain/types';

const VALID_SOURCE_TYPES: Set<string> = new Set(['profile', 'jira', 'confluence', 'github']);

export interface ParsedAnalysisOutput {
  swotOutput: SwotOutput;
  summariesOutput: SummariesOutput;
}

export function parseAnalysisResponse(
  rawResponse: string,
): Result<ParsedAnalysisOutput, DomainError> {
  const jsonString = extractJson(rawResponse);
  if (!jsonString) {
    return err(
      new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        'No JSON block found in LLM response. Expected a ```json code fence.',
      ),
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (cause) {
    return err(
      new DomainError(ERROR_CODES.LLM_PARSE_ERROR, `Invalid JSON: ${(cause as Error).message}`, cause),
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return err(
      new DomainError(ERROR_CODES.LLM_PARSE_ERROR, 'LLM response is not a JSON object'),
    );
  }

  const obj = parsed as Record<string, unknown>;

  const swotResult = validateSwotOutput(obj);
  if (!swotResult.ok) return swotResult;

  const summariesResult = validateSummaries(obj);
  if (!summariesResult.ok) return summariesResult;

  return ok({
    swotOutput: swotResult.value,
    summariesOutput: summariesResult.value,
  });
}

function extractJson(text: string): string | null {
  // Try code fence first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  // Try raw JSON (starts with {)
  const jsonStart = text.indexOf('{');
  if (jsonStart !== -1) {
    const jsonEnd = text.lastIndexOf('}');
    if (jsonEnd > jsonStart) {
      return text.slice(jsonStart, jsonEnd + 1);
    }
  }

  return null;
}

function validateSwotOutput(
  obj: Record<string, unknown>,
): Result<SwotOutput, DomainError> {
  const quadrants = ['strengths', 'weaknesses', 'opportunities', 'threats'] as const;

  for (const quadrant of quadrants) {
    if (!Array.isArray(obj[quadrant])) {
      return err(
        new DomainError(
          ERROR_CODES.LLM_PARSE_ERROR,
          `Missing or invalid "${quadrant}" array in response`,
        ),
      );
    }
  }

  const swotOutput: SwotOutput = {
    strengths: [],
    weaknesses: [],
    opportunities: [],
    threats: [],
  };

  for (const quadrant of quadrants) {
    const items = obj[quadrant] as unknown[];
    for (let i = 0; i < items.length; i++) {
      const itemResult = validateSwotItem(items[i], `${quadrant}[${i}]`);
      if (!itemResult.ok) return itemResult as Result<SwotOutput, DomainError>;
      swotOutput[quadrant].push(itemResult.value);
    }
  }

  return ok(swotOutput);
}

function validateSwotItem(
  raw: unknown,
  path: string,
): Result<SwotItem, DomainError> {
  if (typeof raw !== 'object' || raw === null) {
    return err(
      new DomainError(ERROR_CODES.LLM_PARSE_ERROR, `${path}: expected an object`),
    );
  }

  const item = raw as Record<string, unknown>;

  if (typeof item['claim'] !== 'string') {
    return err(
      new DomainError(ERROR_CODES.LLM_PARSE_ERROR, `${path}.claim: expected a string`),
    );
  }

  if (!Array.isArray(item['evidence'])) {
    return err(
      new DomainError(ERROR_CODES.LLM_PARSE_ERROR, `${path}.evidence: expected an array`),
    );
  }

  if (item['evidence'].length === 0) {
    return err(
      new DomainError(
        ERROR_CODES.LLM_EVIDENCE_INVALID,
        `${path}: SWOT item has no evidence entries`,
      ),
    );
  }

  const evidence: EvidenceEntry[] = [];
  for (let i = 0; i < item['evidence'].length; i++) {
    const evResult = validateEvidenceEntry(
      item['evidence'][i],
      `${path}.evidence[${i}]`,
    );
    if (!evResult.ok) return evResult as Result<SwotItem, DomainError>;
    evidence.push(evResult.value);
  }

  if (typeof item['impact'] !== 'string') {
    return err(
      new DomainError(ERROR_CODES.LLM_PARSE_ERROR, `${path}.impact: expected a string`),
    );
  }

  if (typeof item['recommendation'] !== 'string') {
    return err(
      new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `${path}.recommendation: expected a string`,
      ),
    );
  }

  const confidence = item['confidence'];
  if (confidence !== 'high' && confidence !== 'medium' && confidence !== 'low') {
    return err(
      new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `${path}.confidence: expected "high", "medium", or "low"`,
      ),
    );
  }

  return ok({
    claim: item['claim'] as string,
    evidence,
    impact: item['impact'] as string,
    recommendation: item['recommendation'] as string,
    confidence,
  });
}

function validateEvidenceEntry(
  raw: unknown,
  path: string,
): Result<EvidenceEntry, DomainError> {
  if (typeof raw !== 'object' || raw === null) {
    return err(
      new DomainError(ERROR_CODES.LLM_PARSE_ERROR, `${path}: expected an object`),
    );
  }

  const entry = raw as Record<string, unknown>;

  const sourceType = entry['sourceType'];
  if (typeof sourceType !== 'string' || !VALID_SOURCE_TYPES.has(sourceType)) {
    return err(
      new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `${path}.sourceType: expected one of "profile", "jira", "confluence", "github"`,
      ),
    );
  }

  if (typeof entry['sourceId'] !== 'string') {
    return err(
      new DomainError(ERROR_CODES.LLM_PARSE_ERROR, `${path}.sourceId: expected a string`),
    );
  }

  if (typeof entry['sourceLabel'] !== 'string') {
    return err(
      new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        `${path}.sourceLabel: expected a string`,
      ),
    );
  }

  if (typeof entry['quote'] !== 'string') {
    return err(
      new DomainError(ERROR_CODES.LLM_PARSE_ERROR, `${path}.quote: expected a string`),
    );
  }

  return ok({
    sourceType: sourceType as EvidenceSourceType,
    sourceId: entry['sourceId'] as string,
    sourceLabel: entry['sourceLabel'] as string,
    quote: entry['quote'] as string,
  });
}

function validateSummaries(
  obj: Record<string, unknown>,
): Result<SummariesOutput, DomainError> {
  const summaries = obj['summaries'];
  if (typeof summaries !== 'object' || summaries === null) {
    return err(
      new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        'Missing or invalid "summaries" object in response',
      ),
    );
  }

  const s = summaries as Record<string, unknown>;

  if (typeof s['profiles'] !== 'string') {
    return err(
      new DomainError(
        ERROR_CODES.LLM_PARSE_ERROR,
        'summaries.profiles: expected a string',
      ),
    );
  }

  if (typeof s['jira'] !== 'string') {
    return err(
      new DomainError(ERROR_CODES.LLM_PARSE_ERROR, 'summaries.jira: expected a string'),
    );
  }

  // Confluence and GitHub summaries are optional (null if source not connected)
  const confluence = typeof s['confluence'] === 'string' ? s['confluence'] as string : null;
  const github = typeof s['github'] === 'string' ? s['github'] as string : null;

  return ok({
    profiles: s['profiles'] as string,
    jira: s['jira'] as string,
    confluence,
    github,
  });
}
