import { describe, it, expect, vi } from 'vitest';
import { AnalysisOrchestrator } from './orchestrator';
import type { PipelineStep, PipelineContext, StepProgressFn } from './pipeline-step';

function makeContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    analysisId: 'analysis-1',
    role: 'staff_engineer',
    modelId: 'openai/gpt-4',
    contextWindow: 128000,
    anonymizedProfiles: [],
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
    llmCaller: { call: vi.fn() },
    ...overrides,
  };
}

function makeStep(name: string, transform?: (ctx: PipelineContext) => PipelineContext): PipelineStep {
  return {
    name,
    execute: vi.fn(async (ctx: PipelineContext, _onProgress: StepProgressFn) => {
      return transform ? transform(ctx) : ctx;
    }),
  };
}

describe('AnalysisOrchestrator', () => {
  it('returns context unchanged when no steps are registered', async () => {
    const orchestrator = new AnalysisOrchestrator();
    const context = makeContext();
    const onProgress = vi.fn();

    const result = await orchestrator.run(context, onProgress);

    expect(result).toEqual(context);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('accepts steps via constructor', () => {
    const step1 = makeStep('step-1');
    const step2 = makeStep('step-2');
    const orchestrator = new AnalysisOrchestrator([step1, step2]);

    expect(orchestrator.getSteps()).toHaveLength(2);
    expect(orchestrator.getSteps()[0]!.name).toBe('step-1');
    expect(orchestrator.getSteps()[1]!.name).toBe('step-2');
  });

  it('accepts steps via registerStep', () => {
    const orchestrator = new AnalysisOrchestrator();
    const step = makeStep('dynamic-step');

    orchestrator.registerStep(step);

    expect(orchestrator.getSteps()).toHaveLength(1);
    expect(orchestrator.getSteps()[0]!.name).toBe('dynamic-step');
  });

  it('executes a single step and returns modified context', async () => {
    const step = makeStep('add-warning', (ctx) => ({
      ...ctx,
      warning: 'test warning',
    }));
    const orchestrator = new AnalysisOrchestrator([step]);
    const context = makeContext();
    const onProgress = vi.fn();

    const result = await orchestrator.run(context, onProgress);

    expect(result.warning).toBe('test warning');
    expect(step.execute).toHaveBeenCalledOnce();
    expect(step.execute).toHaveBeenCalledWith(context, onProgress);
  });

  it('chains multiple steps in order', async () => {
    const executionOrder: string[] = [];

    const step1: PipelineStep = {
      name: 'step-1',
      execute: async (ctx, _onProgress) => {
        executionOrder.push('step-1');
        return { ...ctx, warning: 'from-step-1' };
      },
    };

    const step2: PipelineStep = {
      name: 'step-2',
      execute: async (ctx, _onProgress) => {
        executionOrder.push('step-2');
        // Verify it received step-1's output
        expect(ctx.warning).toBe('from-step-1');
        return { ...ctx, rawLlmResponse: 'from-step-2' };
      },
    };

    const step3: PipelineStep = {
      name: 'step-3',
      execute: async (ctx, _onProgress) => {
        executionOrder.push('step-3');
        // Verify it received both prior outputs
        expect(ctx.warning).toBe('from-step-1');
        expect(ctx.rawLlmResponse).toBe('from-step-2');
        return ctx;
      },
    };

    const orchestrator = new AnalysisOrchestrator([step1, step2, step3]);
    const result = await orchestrator.run(makeContext(), vi.fn());

    expect(executionOrder).toEqual(['step-1', 'step-2', 'step-3']);
    expect(result.warning).toBe('from-step-1');
    expect(result.rawLlmResponse).toBe('from-step-2');
  });

  it('propagates step errors', async () => {
    const error = new Error('step failed');
    const failingStep: PipelineStep = {
      name: 'failing-step',
      execute: async () => {
        throw error;
      },
    };
    const neverReachedStep = makeStep('never-reached');

    const orchestrator = new AnalysisOrchestrator([failingStep, neverReachedStep]);

    await expect(orchestrator.run(makeContext(), vi.fn())).rejects.toThrow('step failed');
    expect(neverReachedStep.execute).not.toHaveBeenCalled();
  });

  it('passes the same onProgress function to all steps', async () => {
    const progressCalls: Array<{ step: string; stage: string }> = [];

    const step1: PipelineStep = {
      name: 'step-1',
      execute: async (ctx, onProgress) => {
        onProgress('stage-a', 'message-a');
        return ctx;
      },
    };

    const step2: PipelineStep = {
      name: 'step-2',
      execute: async (ctx, onProgress) => {
        onProgress('stage-b', 'message-b');
        return ctx;
      },
    };

    const onProgress = vi.fn((stage: string, message: string) => {
      progressCalls.push({ step: stage, stage: message });
    });

    const orchestrator = new AnalysisOrchestrator([step1, step2]);
    await orchestrator.run(makeContext(), onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith('stage-a', 'message-a');
    expect(onProgress).toHaveBeenCalledWith('stage-b', 'message-b');
  });

  it('does not mutate the original steps array', () => {
    const steps = [makeStep('original')];
    const orchestrator = new AnalysisOrchestrator(steps);

    orchestrator.registerStep(makeStep('added'));

    expect(steps).toHaveLength(1);
    expect(orchestrator.getSteps()).toHaveLength(2);
  });
});
