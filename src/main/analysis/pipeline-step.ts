import type {
  AnonymizedProfile,
  AnonymizedPayload,
  SwotOutput,
  SummariesOutput,
  EvidenceQualityMetrics,
  ThemeOutput,
} from '../domain/types';
import type { PromptDataSources } from './prompt-builder';
import type { ConnectedSource } from './token-budget';

/**
 * Progress callback for pipeline steps.
 * Steps emit progress updates using the same stage names as the pre-refactor pipeline.
 */
export type StepProgressFn = (stage: string, message: string) => void;

/**
 * Response from an LLM call.
 */
export interface LlmResponse {
  content: string;
  finishReason: string | null;
}

/**
 * Abstraction for calling the LLM. Decouples pipeline steps from HTTP transport.
 */
export interface LlmCaller {
  call(
    messages: Array<{ role: string; content: string }>,
    modelId: string,
    onToken?: (tokenCount: number) => void,
  ): Promise<LlmResponse>;
}

/**
 * The data context that flows through the analysis pipeline.
 * Pre-pipeline code sets the input fields; steps read inputs and write outputs.
 */
export interface PipelineContext {
  // -- Inputs (set before pipeline starts) --
  analysisId: string;
  role: string;
  modelId: string;
  contextWindow: number;
  anonymizedProfiles: AnonymizedProfile[];
  inputSnapshot: AnonymizedPayload;
  dataSources: PromptDataSources;
  connectedSources: ConnectedSource[];
  llmCaller: LlmCaller;

  // -- Outputs (accumulated by steps) --
  themes?: ThemeOutput[];
  swotOutput?: SwotOutput;
  summariesOutput?: SummariesOutput;
  qualityMetrics?: EvidenceQualityMetrics;
  rawLlmResponse?: string;
  warning?: string;
}

/**
 * A single step in the analysis pipeline.
 * Steps are executed in order by the orchestrator.
 */
export interface PipelineStep {
  readonly name: string;
  execute(context: PipelineContext, onProgress: StepProgressFn): Promise<PipelineContext>;
}
