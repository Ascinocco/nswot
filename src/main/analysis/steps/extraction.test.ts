import { describe, it, expect, vi } from 'vitest';
import { ExtractionStep, parseExtractionResponse, buildExtractionCorrectivePrompt } from './extraction';
import type { PipelineContext, LlmCaller, LlmResponse } from '../pipeline-step';
import { DomainError } from '../../domain/errors';

const VALID_EXTRACTION_RESPONSE = `\`\`\`json
{
  "signals": [
    {
      "sourceType": "profile",
      "sourceId": "profile:Stakeholder A",
      "signal": "Team reports on-call burnout",
      "category": "concern",
      "quote": "We are exhausted from on-call rotations"
    },
    {
      "sourceType": "jira",
      "sourceId": "jira:PROJ-101",
      "signal": "Deployment frequency declining",
      "category": "metric",
      "quote": "Deploy count dropped from 10/week to 3/week"
    },
    {
      "sourceType": "profile",
      "sourceId": "profile:Stakeholder B",
      "signal": "Strong testing culture",
      "category": "strength",
      "quote": "Our test coverage is industry-leading"
    }
  ],
  "keyPatterns": [
    "on-call burnout affecting productivity",
    "deployment velocity declining",
    "strong engineering practices"
  ]
}
\`\`\``;

const INVALID_RESPONSE = 'This is not JSON at all.';

const MALFORMED_JSON_RESPONSE = `\`\`\`json
{ "signals": [{ "sourceType": "profile"
\`\`\``;

function makeLlmCaller(response: string, finishReason: string | null = 'stop'): LlmCaller {
  return {
    call: vi.fn().mockResolvedValue({
      content: response,
      finishReason,
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
        quotes: ['We are exhausted from on-call rotations'],
        notes: null,
      },
      {
        label: 'Stakeholder B',
        role: 'Senior Engineer',
        team: 'Quality',
        concerns: null,
        priorities: 'Testing',
        quotes: ['Our test coverage is industry-leading'],
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
      jiraDataMarkdown: '### Stories\n- [PROJ-101] Deploy frequency tracking (Status: Done)',
      confluenceDataMarkdown: null,
      githubDataMarkdown: null,
      codebaseDataMarkdown: null,
    },
    connectedSources: ['jira'],
    llmCaller: makeLlmCaller(VALID_EXTRACTION_RESPONSE),
    ...overrides,
  };
}

describe('parseExtractionResponse', () => {
  it('parses a valid extraction response', () => {
    const result = parseExtractionResponse(VALID_EXTRACTION_RESPONSE);

    expect(result.signals).toHaveLength(3);
    expect(result.signals[0]!.sourceType).toBe('profile');
    expect(result.signals[0]!.category).toBe('concern');
    expect(result.signals[0]!.signal).toBe('Team reports on-call burnout');
    expect(result.signals[1]!.sourceType).toBe('jira');
    expect(result.signals[1]!.category).toBe('metric');
    expect(result.keyPatterns).toHaveLength(3);
    expect(result.keyPatterns[0]).toContain('on-call burnout');
  });

  it('throws on missing JSON block', () => {
    expect(() => parseExtractionResponse(INVALID_RESPONSE)).toThrow(DomainError);
    expect(() => parseExtractionResponse(INVALID_RESPONSE)).toThrow('No JSON block');
  });

  it('throws on malformed JSON', () => {
    expect(() => parseExtractionResponse(MALFORMED_JSON_RESPONSE)).toThrow(DomainError);
    expect(() => parseExtractionResponse(MALFORMED_JSON_RESPONSE)).toThrow('Invalid JSON');
  });

  it('throws on missing signals array', () => {
    const response = '```json\n{ "keyPatterns": [] }\n```';
    expect(() => parseExtractionResponse(response)).toThrow('Missing or invalid "signals"');
  });

  it('throws on invalid signal sourceType', () => {
    const response = `\`\`\`json
{
  "signals": [{ "sourceType": "invalid", "sourceId": "x", "signal": "test", "category": "risk", "quote": "q" }],
  "keyPatterns": []
}
\`\`\``;
    expect(() => parseExtractionResponse(response)).toThrow('sourceType');
  });

  it('throws on invalid signal category', () => {
    const response = `\`\`\`json
{
  "signals": [{ "sourceType": "profile", "sourceId": "x", "signal": "test", "category": "invalid", "quote": "q" }],
  "keyPatterns": []
}
\`\`\``;
    expect(() => parseExtractionResponse(response)).toThrow('category');
  });

  it('throws on empty signal string', () => {
    const response = `\`\`\`json
{
  "signals": [{ "sourceType": "profile", "sourceId": "x", "signal": "", "category": "risk", "quote": "q" }],
  "keyPatterns": []
}
\`\`\``;
    expect(() => parseExtractionResponse(response)).toThrow('non-empty string');
  });

  it('tolerates missing keyPatterns', () => {
    const response = `\`\`\`json
{
  "signals": [{ "sourceType": "profile", "sourceId": "profile:A", "signal": "test", "category": "risk", "quote": "q" }]
}
\`\`\``;
    const result = parseExtractionResponse(response);
    expect(result.keyPatterns).toHaveLength(0);
  });

  it('filters out non-string keyPatterns', () => {
    const response = `\`\`\`json
{
  "signals": [{ "sourceType": "profile", "sourceId": "profile:A", "signal": "test", "category": "risk", "quote": "q" }],
  "keyPatterns": ["valid", 123, "", "also valid"]
}
\`\`\``;
    const result = parseExtractionResponse(response);
    expect(result.keyPatterns).toEqual(['valid', 'also valid']);
  });
});

describe('buildExtractionCorrectivePrompt', () => {
  it('includes the parse error', () => {
    const prompt = buildExtractionCorrectivePrompt('Missing signals array');
    expect(prompt).toContain('Missing signals array');
  });

  it('includes the extraction schema', () => {
    const prompt = buildExtractionCorrectivePrompt('error');
    expect(prompt).toContain('"signals"');
    expect(prompt).toContain('"category"');
    expect(prompt).toContain('"keyPatterns"');
  });
});

describe('ExtractionStep', () => {
  const step = new ExtractionStep();

  it('has the correct name', () => {
    expect(step.name).toBe('extraction');
  });

  it('produces extractionOutput from a valid LLM response', async () => {
    const context = makeContext();
    const onProgress = vi.fn();

    const result = await step.execute(context, onProgress);

    expect(result.extractionOutput).toBeDefined();
    expect(result.extractionOutput!.signals).toHaveLength(3);
    expect(result.extractionOutput!.keyPatterns).toHaveLength(3);
  });

  it('emits progress events', async () => {
    const onProgress = vi.fn();
    await step.execute(makeContext(), onProgress);

    const stages = onProgress.mock.calls.map((c) => c[0]);
    expect(stages).toContain('extracting');
  });

  it('retries with corrective prompt on parse failure then succeeds', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: INVALID_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: VALID_EXTRACTION_RESPONSE, finishReason: 'stop' }),
    };

    const context = makeContext({ llmCaller });
    const result = await step.execute(context, vi.fn());

    expect(llmCaller.call).toHaveBeenCalledTimes(2);
    expect(result.extractionOutput).toBeDefined();
    expect(result.extractionOutput!.signals).toHaveLength(3);
  });

  it('throws when both attempts fail to parse', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: INVALID_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: INVALID_RESPONSE, finishReason: 'stop' }),
    };

    const context = makeContext({ llmCaller });
    await expect(step.execute(context, vi.fn())).rejects.toThrow(DomainError);
    expect(llmCaller.call).toHaveBeenCalledTimes(2);
  });

  it('includes truncation note when finish_reason is length', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: MALFORMED_JSON_RESPONSE, finishReason: 'length' })
        .mockResolvedValueOnce({ content: VALID_EXTRACTION_RESPONSE, finishReason: 'stop' }),
    };

    const context = makeContext({ llmCaller });
    await step.execute(context, vi.fn());

    const secondCallMessages = (llmCaller.call as ReturnType<typeof vi.fn>).mock.calls[1]![0] as Array<{ role: string; content: string }>;
    const lastUserMessage = secondCallMessages[secondCallMessages.length - 1]!;
    expect(lastUserMessage.content).toContain('truncated');
  });

  it('preserves input context fields in output', async () => {
    const context = makeContext();
    const result = await step.execute(context, vi.fn());

    expect(result.analysisId).toBe('analysis-1');
    expect(result.role).toBe('staff_engineer');
    expect(result.modelId).toBe('openai/gpt-4');
  });

  it('calls LLM with extraction-specific prompts', async () => {
    const context = makeContext();
    await step.execute(context, vi.fn());

    const call = (context.llmCaller.call as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const messages = call[0] as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.role).toBe('user');
    expect(messages[0]!.content).toContain('signal extraction');
    expect(messages[1]!.content).toContain('Stakeholder A');
  });
});
