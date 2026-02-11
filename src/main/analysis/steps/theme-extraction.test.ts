import { describe, it, expect, vi } from 'vitest';
import { ThemeExtractionStep } from './theme-extraction';
import type { PipelineContext, LlmCaller, LlmResponse } from '../pipeline-step';
import { DomainError } from '../../domain/errors';

const VALID_THEME_RESPONSE = `\`\`\`json
{
  "themes": [
    {
      "label": "On-call burnout",
      "description": "Multiple stakeholders report excessive on-call burden leading to attrition risk.",
      "evidenceRefs": [
        {
          "sourceType": "profile",
          "sourceId": "profile:Stakeholder A",
          "quote": "Too many pages at night"
        },
        {
          "sourceType": "profile",
          "sourceId": "profile:Stakeholder B",
          "quote": "On-call is unsustainable"
        }
      ],
      "frequency": 2
    },
    {
      "label": "Technical debt accumulation",
      "description": "Codebase quality concerns appear across multiple sources.",
      "evidenceRefs": [
        {
          "sourceType": "profile",
          "sourceId": "profile:Stakeholder A",
          "quote": "We never refactor"
        },
        {
          "sourceType": "jira",
          "sourceId": "jira:TECH-99",
          "quote": "Tech debt backlog: 45 items"
        },
        {
          "sourceType": "github",
          "sourceId": "github:org/repo#200",
          "quote": "Code complexity increasing"
        }
      ],
      "frequency": 3
    }
  ]
}
\`\`\``;

const INVALID_RESPONSE = 'This is not JSON at all.';

const MISSING_THEMES_ARRAY = `\`\`\`json
{ "items": [] }
\`\`\``;

const EMPTY_THEMES = `\`\`\`json
{ "themes": [] }
\`\`\``;

function makeLlmCaller(response: string): LlmCaller {
  return {
    call: vi.fn().mockResolvedValue({
      content: response,
      finishReason: 'stop',
    } satisfies LlmResponse),
  };
}

function makeContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    analysisId: 'analysis-1',
    role: 'staff_engineer',
    modelId: 'openai/gpt-4',
    contextWindow: 128000,
    anonymizedProfiles: [
      {
        label: 'Stakeholder A',
        role: 'Engineer',
        team: 'Platform',
        concerns: 'On-call burden',
        priorities: 'Reliability',
        quotes: ['Too many pages at night'],
        notes: null,
      },
      {
        label: 'Stakeholder B',
        role: 'Engineer',
        team: 'Backend',
        concerns: 'Burnout',
        priorities: 'Work-life balance',
        quotes: ['On-call is unsustainable'],
        notes: null,
      },
    ],
    inputSnapshot: {
      profiles: [],
      jiraData: null,
      confluenceData: null,
      githubData: null,
      codebaseData: null,
      pseudonymMap: {},
    },
    dataSources: {
      jiraDataMarkdown: null,
      confluenceDataMarkdown: null,
      githubDataMarkdown: null,
      codebaseDataMarkdown: null,
    },
    connectedSources: [],
    llmCaller: makeLlmCaller(VALID_THEME_RESPONSE),
    ...overrides,
  };
}

describe('ThemeExtractionStep', () => {
  const step = new ThemeExtractionStep();

  it('has the correct name', () => {
    expect(step.name).toBe('theme-extraction');
  });

  it('extracts themes from a valid LLM response', async () => {
    const context = makeContext();
    const onProgress = vi.fn();

    const result = await step.execute(context, onProgress);

    expect(result.themes).toBeDefined();
    expect(result.themes).toHaveLength(2);
    expect(result.themes![0]!.label).toBe('On-call burnout');
    expect(result.themes![0]!.frequency).toBe(2);
    expect(result.themes![0]!.evidenceRefs).toHaveLength(2);
    expect(result.themes![1]!.label).toBe('Technical debt accumulation');
    expect(result.themes![1]!.frequency).toBe(3);
  });

  it('computes sourceTypes from evidenceRefs', async () => {
    const result = await step.execute(makeContext(), vi.fn());

    expect(result.themes![0]!.sourceTypes).toEqual(['profile']);
    expect(result.themes![1]!.sourceTypes).toEqual(
      expect.arrayContaining(['profile', 'jira', 'github']),
    );
    expect(result.themes![1]!.sourceTypes).toHaveLength(3);
  });

  it('emits progress events', async () => {
    const onProgress = vi.fn();
    await step.execute(makeContext(), onProgress);

    const stages = onProgress.mock.calls.map((c) => c[0]);
    expect(stages).toContain('extracting_themes');
    expect(onProgress.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('preserves existing context fields in output', async () => {
    const context = makeContext();
    const result = await step.execute(context, vi.fn());

    expect(result.analysisId).toBe('analysis-1');
    expect(result.role).toBe('staff_engineer');
    expect(result.modelId).toBe('openai/gpt-4');
    expect(result.anonymizedProfiles).toEqual(context.anonymizedProfiles);
  });

  it('throws DomainError when response is not JSON', async () => {
    const context = makeContext({
      llmCaller: makeLlmCaller(INVALID_RESPONSE),
    });

    await expect(step.execute(context, vi.fn())).rejects.toThrow(DomainError);
  });

  it('throws DomainError when themes array is missing', async () => {
    const context = makeContext({
      llmCaller: makeLlmCaller(MISSING_THEMES_ARRAY),
    });

    await expect(step.execute(context, vi.fn())).rejects.toThrow(DomainError);
  });

  it('returns empty themes array when LLM produces no themes', async () => {
    const context = makeContext({
      llmCaller: makeLlmCaller(EMPTY_THEMES),
    });

    const result = await step.execute(context, vi.fn());
    expect(result.themes).toEqual([]);
  });

  it('calls LLM with system and user messages', async () => {
    const context = makeContext();
    await step.execute(context, vi.fn());

    const call = (context.llmCaller.call as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const messages = call[0] as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.role).toBe('user');
    expect(messages[0]!.content).toContain('pattern recognition');
    expect(messages[1]!.content).toContain('Stakeholder A');
  });

  it('passes the correct model ID to LLM caller', async () => {
    const context = makeContext({ modelId: 'anthropic/claude-3-haiku' });
    await step.execute(context, vi.fn());

    const call = (context.llmCaller.call as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[1]).toBe('anthropic/claude-3-haiku');
  });

  it('validates evidence ref structure', async () => {
    const badEvidenceResponse = `\`\`\`json
{
  "themes": [
    {
      "label": "Test theme",
      "description": "A test",
      "evidenceRefs": [
        { "sourceType": "invalid_type", "sourceId": "x", "quote": "y" }
      ],
      "frequency": 1
    }
  ]
}
\`\`\``;

    const context = makeContext({
      llmCaller: makeLlmCaller(badEvidenceResponse),
    });

    await expect(step.execute(context, vi.fn())).rejects.toThrow(DomainError);
  });

  it('defaults frequency to evidence count when not a valid number', async () => {
    const noFrequencyResponse = `\`\`\`json
{
  "themes": [
    {
      "label": "Test theme",
      "description": "A test theme",
      "evidenceRefs": [
        { "sourceType": "profile", "sourceId": "profile:Stakeholder A", "quote": "quote 1" },
        { "sourceType": "profile", "sourceId": "profile:Stakeholder B", "quote": "quote 2" },
        { "sourceType": "jira", "sourceId": "jira:X-1", "quote": "quote 3" }
      ]
    }
  ]
}
\`\`\``;

    const context = makeContext({
      llmCaller: makeLlmCaller(noFrequencyResponse),
    });

    const result = await step.execute(context, vi.fn());
    expect(result.themes![0]!.frequency).toBe(3);
  });
});
