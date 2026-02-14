interface PipelineProgressProps {
  currentStage: string | null;
  completedStages: string[];
  error: string | null;
  message?: string | null;
}

const PIPELINE_STAGES = [
  { id: 'syncing', label: 'Sync data' },
  { id: 'collecting', label: 'Load data' },
  { id: 'anonymizing', label: 'Anonymize' },
  { id: 'building_prompt', label: 'Build prompt' },
  { id: 'sending', label: 'LLM generating' },
  { id: 'parsing', label: 'Parse' },
  { id: 'validating', label: 'Validate' },
  { id: 'storing', label: 'Store' },
] as const;

export default function PipelineProgress({
  currentStage,
  completedStages,
  error,
  message,
}: PipelineProgressProps): React.JSX.Element {
  const allComplete = completedStages.includes('completed');

  if (allComplete) {
    return (
      <div className="mb-3 rounded-lg border border-green-900/50 bg-green-950/30 px-4 py-2 text-sm text-green-400">
        Analysis complete
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
      <div className="flex items-center gap-1">
        {PIPELINE_STAGES.map((stage, i) => {
          const isCurrent = currentStage === stage.id;
          const isComplete = completedStages.includes(stage.id) && !isCurrent;
          const hasError = error && isCurrent;

          return (
            <div key={stage.id} className="flex items-center">
              {/* Step indicator */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    hasError
                      ? 'bg-red-900/50 text-red-400'
                      : isComplete
                        ? 'bg-green-900/50 text-green-400'
                        : isCurrent
                          ? 'animate-pulse bg-blue-900/50 text-blue-400'
                          : 'bg-gray-800 text-gray-600'
                  }`}
                >
                  {hasError ? '!' : isComplete ? '\u2713' : i + 1}
                </div>
                <span
                  className={`mt-1 text-[10px] leading-tight ${
                    hasError
                      ? 'text-red-400'
                      : isCurrent
                        ? 'text-blue-400'
                        : isComplete
                          ? 'text-green-400/70'
                          : 'text-gray-600'
                  }`}
                >
                  {stage.label}
                </span>
              </div>

              {/* Connector line */}
              {i < PIPELINE_STAGES.length - 1 && (
                <div
                  className={`mx-1 h-px w-4 ${
                    isComplete ? 'bg-green-800' : 'bg-gray-800'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      {message && currentStage && !error && (
        <p className="mt-2 text-xs text-gray-400">{message}</p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
