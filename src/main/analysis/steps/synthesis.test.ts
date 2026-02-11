import { describe, it, expect, vi } from 'vitest';
import { SynthesisStep, parseSynthesisResponse, buildSynthesisCorrectivePrompt } from './synthesis';
import type { PipelineContext, LlmCaller, LlmResponse } from '../pipeline-step';
import type { ExtractionOutput } from '../../domain/types';
import { DomainError } from '../../domain/errors';

const VALID_SYNTHESIS_RESPONSE = `\`\`\`json
{
  "correlations": [
    {
      "claim": "On-call burnout is impacting deployment velocity",
      "supportingSignals": [
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
        }
      ],
      "sourceTypes": ["profile", "jira"],
      "agreement": "moderate",
      "conflicts": []
    },
    {
      "claim": "Strong engineering practices provide a foundation for improvement",
      "supportingSignals": [
        {
          "sourceType": "profile",
          "sourceId": "profile:Stakeholder B",
          "signal": "Strong testing culture",
          "category": "strength",
          "quote": "Our test coverage is industry-leading"
        }
      ],
      "sourceTypes": ["profile"],
      "agreement": "weak",
      "conflicts": ["Some team members feel tests slow down iteration"]
    }
  ],
  "synthesisMarkdown": "## Synthesis\\n\\nTwo key patterns emerge from the data:\\n\\n1. **On-call burnout and deployment velocity**: Stakeholder interviews and Jira metrics both indicate that on-call fatigue is correlated with declining deployment frequency.\\n\\n2. **Strong engineering fundamentals**: Testing culture is strong, though there is some tension between thoroughness and iteration speed."
}
\`\`\``;

const INVALID_RESPONSE = 'Not JSON';

const MALFORMED_JSON_RESPONSE = `\`\`\`json
{ "correlations": [{ "claim": "test"
\`\`\``;

const TEST_EXTRACTION_OUTPUT: ExtractionOutput = {
  signals: [
    {
      sourceType: 'profile',
      sourceId: 'profile:Stakeholder A',
      signal: 'Team reports on-call burnout',
      category: 'concern',
      quote: 'We are exhausted from on-call rotations',
    },
    {
      sourceType: 'jira',
      sourceId: 'jira:PROJ-101',
      signal: 'Deployment frequency declining',
      category: 'metric',
      quote: 'Deploy count dropped from 10/week to 3/week',
    },
    {
      sourceType: 'profile',
      sourceId: 'profile:Stakeholder B',
      signal: 'Strong testing culture',
      category: 'strength',
      quote: 'Our test coverage is industry-leading',
    },
  ],
  keyPatterns: ['on-call burnout', 'deployment velocity declining', 'strong testing culture'],
};

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
    llmCaller: makeLlmCaller(VALID_SYNTHESIS_RESPONSE),
    extractionOutput: TEST_EXTRACTION_OUTPUT,
    ...overrides,
  };
}

describe('parseSynthesisResponse', () => {
  it('parses a valid synthesis response', () => {
    const result = parseSynthesisResponse(VALID_SYNTHESIS_RESPONSE);

    expect(result.correlations).toHaveLength(2);
    expect(result.correlations[0]!.claim).toContain('On-call burnout');
    expect(result.correlations[0]!.agreement).toBe('moderate');
    expect(result.correlations[0]!.supportingSignals).toHaveLength(2);
    expect(result.correlations[0]!.sourceTypes).toEqual(['profile', 'jira']);
    expect(result.correlations[0]!.conflicts).toHaveLength(0);
    expect(result.correlations[1]!.conflicts).toHaveLength(1);
    expect(result.synthesisMarkdown).toContain('Synthesis');
  });

  it('throws on missing JSON block', () => {
    expect(() => parseSynthesisResponse(INVALID_RESPONSE)).toThrow(DomainError);
    expect(() => parseSynthesisResponse(INVALID_RESPONSE)).toThrow('No JSON block');
  });

  it('throws on malformed JSON', () => {
    expect(() => parseSynthesisResponse(MALFORMED_JSON_RESPONSE)).toThrow('Invalid JSON');
  });

  it('throws on missing correlations array', () => {
    const response = '```json\n{ "synthesisMarkdown": "test" }\n```';
    expect(() => parseSynthesisResponse(response)).toThrow('Missing or invalid "correlations"');
  });

  it('throws on missing synthesisMarkdown', () => {
    const response = '```json\n{ "correlations": [] }\n```';
    expect(() => parseSynthesisResponse(response)).toThrow('Missing or invalid "synthesisMarkdown"');
  });

  it('throws on empty claim', () => {
    const response = `\`\`\`json
{
  "correlations": [{
    "claim": "",
    "supportingSignals": [],
    "sourceTypes": [],
    "agreement": "weak",
    "conflicts": []
  }],
  "synthesisMarkdown": "test"
}
\`\`\``;
    expect(() => parseSynthesisResponse(response)).toThrow('non-empty string');
  });

  it('throws on invalid agreement value', () => {
    const response = `\`\`\`json
{
  "correlations": [{
    "claim": "test",
    "supportingSignals": [],
    "sourceTypes": [],
    "agreement": "invalid",
    "conflicts": []
  }],
  "synthesisMarkdown": "test"
}
\`\`\``;
    expect(() => parseSynthesisResponse(response)).toThrow('agreement');
  });

  it('validates supporting signal fields', () => {
    const response = `\`\`\`json
{
  "correlations": [{
    "claim": "test",
    "supportingSignals": [{ "sourceType": "bad", "sourceId": "x", "signal": "s", "category": "risk", "quote": "q" }],
    "sourceTypes": [],
    "agreement": "weak",
    "conflicts": []
  }],
  "synthesisMarkdown": "test"
}
\`\`\``;
    expect(() => parseSynthesisResponse(response)).toThrow('sourceType');
  });

  it('filters empty conflict strings', () => {
    const response = `\`\`\`json
{
  "correlations": [{
    "claim": "test",
    "supportingSignals": [],
    "sourceTypes": ["profile"],
    "agreement": "weak",
    "conflicts": ["real conflict", "", "another"]
  }],
  "synthesisMarkdown": "test narrative"
}
\`\`\``;
    const result = parseSynthesisResponse(response);
    expect(result.correlations[0]!.conflicts).toEqual(['real conflict', 'another']);
  });
});

describe('buildSynthesisCorrectivePrompt', () => {
  it('includes the parse error', () => {
    const prompt = buildSynthesisCorrectivePrompt('Missing correlations');
    expect(prompt).toContain('Missing correlations');
  });

  it('includes the synthesis schema', () => {
    const prompt = buildSynthesisCorrectivePrompt('error');
    expect(prompt).toContain('"correlations"');
    expect(prompt).toContain('"synthesisMarkdown"');
    expect(prompt).toContain('"agreement"');
  });
});

describe('SynthesisStep', () => {
  const step = new SynthesisStep();

  it('has the correct name', () => {
    expect(step.name).toBe('synthesis');
  });

  it('produces synthesisOutput from a valid LLM response', async () => {
    const context = makeContext();
    const onProgress = vi.fn();

    const result = await step.execute(context, onProgress);

    expect(result.synthesisOutput).toBeDefined();
    expect(result.synthesisOutput!.correlations).toHaveLength(2);
    expect(result.synthesisOutput!.synthesisMarkdown).toContain('Synthesis');
  });

  it('throws when extractionOutput is missing', async () => {
    const context = makeContext({ extractionOutput: undefined });

    await expect(step.execute(context, vi.fn())).rejects.toThrow(
      'SynthesisStep requires extractionOutput',
    );
  });

  it('returns empty synthesis when signals array is empty', async () => {
    const context = makeContext({
      extractionOutput: { signals: [], keyPatterns: [] },
    });

    const result = await step.execute(context, vi.fn());

    expect(result.synthesisOutput).toBeDefined();
    expect(result.synthesisOutput!.correlations).toHaveLength(0);
    expect(result.synthesisOutput!.synthesisMarkdown).toContain('No signals');
    // Should not call LLM
    expect(context.llmCaller.call).not.toHaveBeenCalled();
  });

  it('emits progress events', async () => {
    const onProgress = vi.fn();
    await step.execute(makeContext(), onProgress);

    const stages = onProgress.mock.calls.map((c) => c[0]);
    expect(stages).toContain('synthesizing');
  });

  it('retries with corrective prompt on parse failure then succeeds', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: INVALID_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: VALID_SYNTHESIS_RESPONSE, finishReason: 'stop' }),
    };

    const context = makeContext({ llmCaller });
    const result = await step.execute(context, vi.fn());

    expect(llmCaller.call).toHaveBeenCalledTimes(2);
    expect(result.synthesisOutput).toBeDefined();
  });

  it('throws when both attempts fail', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: INVALID_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: INVALID_RESPONSE, finishReason: 'stop' }),
    };

    const context = makeContext({ llmCaller });
    await expect(step.execute(context, vi.fn())).rejects.toThrow(DomainError);
    expect(llmCaller.call).toHaveBeenCalledTimes(2);
  });

  it('preserves input context fields in output', async () => {
    const context = makeContext();
    const result = await step.execute(context, vi.fn());

    expect(result.analysisId).toBe('analysis-1');
    expect(result.role).toBe('staff_engineer');
    expect(result.extractionOutput).toBeDefined();
  });

  it('passes extraction signals in the prompt', async () => {
    const context = makeContext();
    await step.execute(context, vi.fn());

    const call = (context.llmCaller.call as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const messages = call[0] as Array<{ role: string; content: string }>;
    expect(messages[1]!.content).toContain('on-call burnout');
    expect(messages[1]!.content).toContain('Deployment frequency declining');
  });
});
