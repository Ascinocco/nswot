import { describe, it, expect, vi } from 'vitest';
import { AnalysisOrchestrator } from './orchestrator';
import { ExtractionStep } from './steps/extraction';
import { SynthesisStep } from './steps/synthesis';
import { SwotGenerationStep } from './steps/swot-generation';
import type { PipelineContext, LlmCaller, LlmResponse } from './pipeline-step';

const VALID_EXTRACTION_RESPONSE = `\`\`\`json
{
  "signals": [
    {
      "sourceType": "profile",
      "sourceId": "profile:Stakeholder A",
      "signal": "Team reports on-call burnout affecting productivity",
      "category": "concern",
      "quote": "We are exhausted from on-call rotations"
    },
    {
      "sourceType": "jira",
      "sourceId": "jira:PROJ-101",
      "signal": "Deployment frequency has declined over last quarter",
      "category": "metric",
      "quote": "Deploy count dropped from 10/week to 3/week"
    },
    {
      "sourceType": "profile",
      "sourceId": "profile:Stakeholder B",
      "signal": "Strong testing culture across the team",
      "category": "strength",
      "quote": "Our test coverage is industry-leading at 92%"
    }
  ],
  "keyPatterns": [
    "on-call burnout affecting productivity",
    "deployment velocity declining"
  ]
}
\`\`\``;

const VALID_SYNTHESIS_RESPONSE = `\`\`\`json
{
  "correlations": [
    {
      "claim": "On-call burnout is correlated with declining deployment velocity",
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
    }
  ],
  "synthesisMarkdown": "## Synthesis\\n\\nOn-call burnout (reported by stakeholders) correlates with declining deployment frequency (Jira metrics). Strong testing culture provides a foundation for improvement."
}
\`\`\``;

const VALID_SWOT_RESPONSE = `\`\`\`json
{
  "strengths": [
    {
      "claim": "Strong testing culture with 92% coverage",
      "evidence": [
        {
          "sourceType": "profile",
          "sourceId": "profile:Stakeholder B",
          "sourceLabel": "Stakeholder B",
          "quote": "Our test coverage is industry-leading at 92%"
        }
      ],
      "impact": "Reduces regression risk and enables confident refactoring",
      "recommendation": "Leverage testing culture to improve CI pipeline speed",
      "confidence": "high"
    }
  ],
  "weaknesses": [
    {
      "claim": "On-call burnout reducing team productivity",
      "evidence": [
        {
          "sourceType": "profile",
          "sourceId": "profile:Stakeholder A",
          "sourceLabel": "Stakeholder A",
          "quote": "We are exhausted from on-call rotations"
        },
        {
          "sourceType": "jira",
          "sourceId": "jira:PROJ-101",
          "sourceLabel": "PROJ-101",
          "quote": "Deploy count dropped from 10/week to 3/week"
        }
      ],
      "impact": "Declining deployment velocity and team morale",
      "recommendation": "Restructure on-call rotation to reduce individual burden",
      "confidence": "high"
    }
  ],
  "opportunities": [],
  "threats": [],
  "summaries": {
    "profiles": "Stakeholders report on-call burnout but strong testing culture.",
    "jira": "Deployment frequency declining based on project metrics."
  }
}
\`\`\``;

function makeContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    analysisId: 'analysis-integration',
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
        quotes: ['Our test coverage is industry-leading at 92%'],
        notes: null,
      },
    ],
    inputSnapshot: {
      profiles: [
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
          quotes: ['Our test coverage is industry-leading at 92%'],
          notes: null,
        },
      ],
      jiraData: { markdown: '### Stories\n- [PROJ-101] Deploy tracking' },
      confluenceData: null,
      githubData: null,
      codebaseData: null,
      pseudonymMap: { 'Stakeholder A': 'Alice', 'Stakeholder B': 'Bob' },
    },
    dataSources: {
      jiraDataMarkdown: '### Stories\n- [PROJ-101] Deploy frequency tracking (Status: Done)',
      confluenceDataMarkdown: null,
      githubDataMarkdown: null,
      codebaseDataMarkdown: null,
    },
    connectedSources: ['jira'],
    llmCaller: { call: vi.fn() },
    ...overrides,
  };
}

describe('Multi-step pipeline integration', () => {
  it('runs extraction → synthesis → swot-generation and produces all outputs', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: VALID_EXTRACTION_RESPONSE, finishReason: 'stop' } satisfies LlmResponse)
        .mockResolvedValueOnce({ content: VALID_SYNTHESIS_RESPONSE, finishReason: 'stop' } satisfies LlmResponse)
        .mockResolvedValueOnce({ content: VALID_SWOT_RESPONSE, finishReason: 'stop' } satisfies LlmResponse),
    };

    const orchestrator = new AnalysisOrchestrator([
      new ExtractionStep(),
      new SynthesisStep(),
      new SwotGenerationStep(),
    ]);

    const context = makeContext({ llmCaller });
    const onProgress = vi.fn();
    const result = await orchestrator.run(context, onProgress);

    // Extraction output
    expect(result.extractionOutput).toBeDefined();
    expect(result.extractionOutput!.signals).toHaveLength(3);
    expect(result.extractionOutput!.keyPatterns).toHaveLength(2);

    // Synthesis output
    expect(result.synthesisOutput).toBeDefined();
    expect(result.synthesisOutput!.correlations).toHaveLength(1);
    expect(result.synthesisOutput!.synthesisMarkdown).toContain('Synthesis');

    // SWOT output
    expect(result.swotOutput).toBeDefined();
    expect(result.swotOutput!.strengths).toHaveLength(1);
    expect(result.swotOutput!.weaknesses).toHaveLength(1);

    // Summaries and quality metrics
    expect(result.summariesOutput).toBeDefined();
    expect(result.qualityMetrics).toBeDefined();
    expect(result.rawLlmResponse).toBeDefined();

    // All 3 LLM calls made
    expect(llmCaller.call).toHaveBeenCalledTimes(3);
  });

  it('threads extraction output into synthesis step', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: VALID_EXTRACTION_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: VALID_SYNTHESIS_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: VALID_SWOT_RESPONSE, finishReason: 'stop' }),
    };

    const orchestrator = new AnalysisOrchestrator([
      new ExtractionStep(),
      new SynthesisStep(),
      new SwotGenerationStep(),
    ]);

    const result = await orchestrator.run(makeContext({ llmCaller }), vi.fn());

    // Synthesis call (second LLM call) should include extraction signals in its prompt
    const synthesisCalls = (llmCaller.call as ReturnType<typeof vi.fn>).mock.calls[1]!;
    const synthesisMessages = synthesisCalls[0] as Array<{ role: string; content: string }>;
    const userPrompt = synthesisMessages[1]!.content;
    expect(userPrompt).toContain('on-call burnout');
    expect(userPrompt).toContain('Deployment frequency');

    // Extraction output is preserved in final result
    expect(result.extractionOutput!.signals[0]!.signal).toContain('on-call burnout');
  });

  it('appends synthesis markdown to SWOT generation prompt', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: VALID_EXTRACTION_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: VALID_SYNTHESIS_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: VALID_SWOT_RESPONSE, finishReason: 'stop' }),
    };

    const orchestrator = new AnalysisOrchestrator([
      new ExtractionStep(),
      new SynthesisStep(),
      new SwotGenerationStep(),
    ]);

    await orchestrator.run(makeContext({ llmCaller }), vi.fn());

    // Third LLM call (SWOT generation) should include synthesis markdown
    const swotCalls = (llmCaller.call as ReturnType<typeof vi.fn>).mock.calls[2]!;
    const swotMessages = swotCalls[0] as Array<{ role: string; content: string }>;
    const swotUserPrompt = swotMessages[1]!.content;
    expect(swotUserPrompt).toContain('Cross-Source Synthesis (Pre-Analysis)');
    expect(swotUserPrompt).toContain('On-call burnout');
  });

  it('emits progress events for all three steps in order', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: VALID_EXTRACTION_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: VALID_SYNTHESIS_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: VALID_SWOT_RESPONSE, finishReason: 'stop' }),
    };

    const orchestrator = new AnalysisOrchestrator([
      new ExtractionStep(),
      new SynthesisStep(),
      new SwotGenerationStep(),
    ]);

    const onProgress = vi.fn();
    await orchestrator.run(makeContext({ llmCaller }), onProgress);

    const stages = onProgress.mock.calls.map((c) => c[0] as string);

    // Should have extracting, synthesizing, and swot-generation stages
    expect(stages.some((s) => s === 'extracting')).toBe(true);
    expect(stages.some((s) => s === 'synthesizing')).toBe(true);
    expect(stages.some((s) => s === 'building_prompt')).toBe(true);

    // Extracting must come before synthesizing
    const firstExtracting = stages.indexOf('extracting');
    const firstSynthesizing = stages.indexOf('synthesizing');
    const firstBuildingPrompt = stages.indexOf('building_prompt');
    expect(firstExtracting).toBeLessThan(firstSynthesizing);
    expect(firstSynthesizing).toBeLessThan(firstBuildingPrompt);
  });

  it('single-step mode runs only SwotGenerationStep', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn().mockResolvedValue({
        content: VALID_SWOT_RESPONSE,
        finishReason: 'stop',
      }),
    };

    const orchestrator = new AnalysisOrchestrator([new SwotGenerationStep()]);
    const result = await orchestrator.run(makeContext({ llmCaller }), vi.fn());

    expect(llmCaller.call).toHaveBeenCalledTimes(1);
    expect(result.swotOutput).toBeDefined();
    expect(result.extractionOutput).toBeUndefined();
    expect(result.synthesisOutput).toBeUndefined();
  });

  it('computes sourceCoverage as part of quality metrics', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: VALID_EXTRACTION_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: VALID_SYNTHESIS_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: VALID_SWOT_RESPONSE, finishReason: 'stop' }),
    };

    const orchestrator = new AnalysisOrchestrator([
      new ExtractionStep(),
      new SynthesisStep(),
      new SwotGenerationStep(),
    ]);

    const result = await orchestrator.run(makeContext({ llmCaller }), vi.fn());

    expect(result.qualityMetrics).toBeDefined();
    expect(result.qualityMetrics!.sourceCoverage).toBeDefined();
    expect(result.qualityMetrics!.sourceCoverage!.length).toBeGreaterThan(0);

    // Profile coverage: 2 profiles available, at least 1 cited
    const profileCov = result.qualityMetrics!.sourceCoverage!.find((c) => c.sourceType === 'profile');
    expect(profileCov).toBeDefined();
    expect(profileCov!.total).toBe(2);
    expect(profileCov!.cited).toBeGreaterThanOrEqual(1);

    // Jira coverage: PROJ-101 available, 1 cited
    const jiraCov = result.qualityMetrics!.sourceCoverage!.find((c) => c.sourceType === 'jira');
    expect(jiraCov).toBeDefined();
    expect(jiraCov!.cited).toBeGreaterThanOrEqual(1);
  });

  it('handles corrective retry during extraction step', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        // First extraction call fails (invalid), second succeeds
        .mockResolvedValueOnce({ content: 'not json', finishReason: 'stop' })
        .mockResolvedValueOnce({ content: VALID_EXTRACTION_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: VALID_SYNTHESIS_RESPONSE, finishReason: 'stop' })
        .mockResolvedValueOnce({ content: VALID_SWOT_RESPONSE, finishReason: 'stop' }),
    };

    const orchestrator = new AnalysisOrchestrator([
      new ExtractionStep(),
      new SynthesisStep(),
      new SwotGenerationStep(),
    ]);

    const result = await orchestrator.run(makeContext({ llmCaller }), vi.fn());

    // 4 calls: extraction fail + retry, synthesis, swot
    expect(llmCaller.call).toHaveBeenCalledTimes(4);
    expect(result.swotOutput).toBeDefined();
    expect(result.extractionOutput).toBeDefined();
  });
});
