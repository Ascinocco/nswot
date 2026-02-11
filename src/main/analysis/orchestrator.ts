import type { PipelineStep, PipelineContext, StepProgressFn } from './pipeline-step';

/**
 * Runs pipeline steps in sequence, threading context through each step.
 *
 * With the default SwotGenerationStep registered, this produces identical output
 * to the pre-refactor monolithic pipeline in AnalysisService.
 */
export class AnalysisOrchestrator {
  private readonly steps: PipelineStep[];

  constructor(steps: PipelineStep[] = []) {
    this.steps = [...steps];
  }

  registerStep(step: PipelineStep): void {
    this.steps.push(step);
  }

  getSteps(): readonly PipelineStep[] {
    return this.steps;
  }

  async run(
    context: PipelineContext,
    onProgress: StepProgressFn,
  ): Promise<PipelineContext> {
    let ctx = context;
    for (const step of this.steps) {
      ctx = await step.execute(ctx, onProgress);
    }
    return ctx;
  }
}
