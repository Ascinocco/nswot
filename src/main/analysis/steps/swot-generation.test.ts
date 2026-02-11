import { describe, it, expect, vi } from 'vitest';
import { SwotGenerationStep } from './swot-generation';
import type { PipelineContext, LlmCaller, LlmResponse } from '../pipeline-step';
import { DomainError } from '../../domain/errors';

const VALID_LLM_RESPONSE = `\`\`\`json
{
  "strengths": [
    {
      "claim": "Strong technical leadership",
      "evidence": [
        {
          "sourceType": "profile",
          "sourceId": "profile:Stakeholder A",
          "sourceLabel": "Stakeholder A",
          "quote": "Great technical depth"
        }
      ],
      "impact": "Enables complex initiatives",
      "recommendation": "Leverage for reviews",
      "confidence": "high"
    }
  ],
  "weaknesses": [],
  "opportunities": [],
  "threats": [],
  "summaries": {
    "profiles": "Key themes include technical leadership.",
    "jira": "No Jira data available."
  }
}
\`\`\``;

const INVALID_LLM_RESPONSE = 'This is not JSON at all.';

const MALFORMED_JSON_RESPONSE = `\`\`\`json
{ "strengths": [{ "claim": "test"
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
        concerns: 'Scaling',
        priorities: 'Reliability',
        quotes: ['Great technical depth'],
        notes: null,
      },
    ],
    inputSnapshot: {
      profiles: [
        {
          label: 'Stakeholder A',
          role: 'Engineer',
          team: 'Platform',
          concerns: 'Scaling',
          priorities: 'Reliability',
          quotes: ['Great technical depth'],
          notes: null,
        },
      ],
      jiraData: null,
      confluenceData: null,
      githubData: null,
      codebaseData: null,
      pseudonymMap: { 'Stakeholder A': 'Alice Smith' },
    },
    dataSources: {
      jiraDataMarkdown: null,
      confluenceDataMarkdown: null,
      githubDataMarkdown: null,
      codebaseDataMarkdown: null,
    },
    connectedSources: [],
    llmCaller: makeLlmCaller(VALID_LLM_RESPONSE),
    ...overrides,
  };
}

describe('SwotGenerationStep', () => {
  const step = new SwotGenerationStep();

  it('has the correct name', () => {
    expect(step.name).toBe('swot-generation');
  });

  it('produces swotOutput from a valid LLM response', async () => {
    const context = makeContext();
    const onProgress = vi.fn();

    const result = await step.execute(context, onProgress);

    expect(result.swotOutput).toBeDefined();
    expect(result.swotOutput!.strengths).toHaveLength(1);
    expect(result.swotOutput!.strengths[0]!.claim).toBe('Strong technical leadership');
    expect(result.swotOutput!.weaknesses).toHaveLength(0);
  });

  it('produces summariesOutput', async () => {
    const result = await step.execute(makeContext(), vi.fn());

    expect(result.summariesOutput).toBeDefined();
    expect(result.summariesOutput!.profiles).toContain('technical leadership');
    expect(result.summariesOutput!.jira).toBeDefined();
  });

  it('produces qualityMetrics', async () => {
    const result = await step.execute(makeContext(), vi.fn());

    expect(result.qualityMetrics).toBeDefined();
    expect(result.qualityMetrics!.totalItems).toBe(1);
    expect(result.qualityMetrics!.confidenceDistribution.high).toBe(1);
  });

  it('stores rawLlmResponse', async () => {
    const result = await step.execute(makeContext(), vi.fn());

    expect(result.rawLlmResponse).toBe(VALID_LLM_RESPONSE);
  });

  it('emits progress events in the correct order', async () => {
    const onProgress = vi.fn();
    await step.execute(makeContext(), onProgress);

    const stages = onProgress.mock.calls.map((c) => c[0]);
    expect(stages).toContain('building_prompt');
    expect(stages).toContain('sending');
    expect(stages).toContain('parsing');
    expect(stages).toContain('validating');

    // building_prompt must come first
    expect(stages.indexOf('building_prompt')).toBe(0);
    // sending must come before parsing
    expect(stages.indexOf('sending')).toBeLessThan(stages.indexOf('parsing'));
    // parsing must come before validating
    expect(stages.indexOf('parsing')).toBeLessThan(stages.indexOf('validating'));
  });

  it('retries with corrective prompt on parse failure then succeeds', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: INVALID_LLM_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: VALID_LLM_RESPONSE, finishReason: 'stop' }),
    };

    const context = makeContext({ llmCaller });
    const onProgress = vi.fn();

    const result = await step.execute(context, onProgress);

    expect(llmCaller.call).toHaveBeenCalledTimes(2);
    expect(result.swotOutput).toBeDefined();
    expect(result.swotOutput!.strengths).toHaveLength(1);

    // Should have emitted 'sending' with retry message
    const sendingMessages = onProgress.mock.calls
      .filter((c) => c[0] === 'sending')
      .map((c) => c[1]);
    expect(sendingMessages).toContain('Retrying with corrective prompt...');
  });

  it('includes truncation note in corrective prompt when finish_reason is length', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: MALFORMED_JSON_RESPONSE, finishReason: 'length' })
        .mockResolvedValueOnce({ content: VALID_LLM_RESPONSE, finishReason: 'stop' }),
    };

    const context = makeContext({ llmCaller });
    await step.execute(context, vi.fn());

    // Second call should include the corrective prompt with truncation mention
    const secondCallMessages = (llmCaller.call as ReturnType<typeof vi.fn>).mock.calls[1]![0] as Array<{ role: string; content: string }>;
    const lastUserMessage = secondCallMessages[secondCallMessages.length - 1]!;
    expect(lastUserMessage.content).toContain('truncated');
    expect(lastUserMessage.content).toContain('Be more concise');
  });

  it('throws DomainError when both attempts fail to parse', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: INVALID_LLM_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: INVALID_LLM_RESPONSE, finishReason: 'stop' }),
    };

    const context = makeContext({ llmCaller });

    await expect(step.execute(context, vi.fn())).rejects.toThrow(DomainError);
    expect(llmCaller.call).toHaveBeenCalledTimes(2);
  });

  it('sets warning when evidence validation has warnings', async () => {
    // Use a valid response but with a sourceId that doesn't match the input snapshot
    const responseWithBadSourceId = VALID_LLM_RESPONSE.replace(
      'profile:Stakeholder A',
      'profile:Stakeholder Z',
    );
    const context = makeContext({
      llmCaller: makeLlmCaller(responseWithBadSourceId),
    });

    const result = await step.execute(context, vi.fn());

    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('Evidence validation warnings');
    expect(result.warning).toContain('Stakeholder Z');
  });

  it('preserves input context fields in output', async () => {
    const context = makeContext();
    const result = await step.execute(context, vi.fn());

    expect(result.analysisId).toBe('analysis-1');
    expect(result.role).toBe('staff_engineer');
    expect(result.modelId).toBe('openai/gpt-4');
    expect(result.contextWindow).toBe(128000);
    expect(result.anonymizedProfiles).toEqual(context.anonymizedProfiles);
  });

  it('calls LLM with system and user messages', async () => {
    const context = makeContext();
    await step.execute(context, vi.fn());

    const call = (context.llmCaller.call as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const messages = call[0] as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.role).toBe('user');
    // System prompt should contain the standard rules
    expect(messages[0]!.content).toContain('NEVER invent information');
    // User prompt should contain the anonymized profile
    expect(messages[1]!.content).toContain('Stakeholder A');
    expect(messages[1]!.content).toContain('Staff Engineer');
  });

  it('passes the correct model ID to LLM caller', async () => {
    const context = makeContext({ modelId: 'anthropic/claude-3-haiku' });
    await step.execute(context, vi.fn());

    const call = (context.llmCaller.call as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[1]).toBe('anthropic/claude-3-haiku');
  });
});
