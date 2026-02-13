interface PinnedSummaryProps {
  analysisIds: string[];
  onJumpToResults: (analysisId: string) => void;
}

export default function PinnedSummary({
  analysisIds,
  onJumpToResults,
}: PinnedSummaryProps): React.JSX.Element | null {
  if (analysisIds.length === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1.5">
      <svg className="h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
      <span className="text-[10px] text-gray-500">Results:</span>
      {analysisIds.map((id, i) => (
        <button
          key={id}
          onClick={() => onJumpToResults(id)}
          className="rounded bg-blue-900/30 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 hover:bg-blue-900/50 transition-colors"
        >
          {analysisIds.length === 1 ? 'Jump to results' : `Run ${i + 1}`}
        </button>
      ))}
    </div>
  );
}
