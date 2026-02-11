interface ComparisonSummaryPanelProps {
  summary: ComparisonSummary;
}

const CATEGORY_LABELS: Record<SwotCategory, string> = {
  strengths: 'Strengths',
  weaknesses: 'Weaknesses',
  opportunities: 'Opportunities',
  threats: 'Threats',
};

const CATEGORY_COLORS: Record<SwotCategory, string> = {
  strengths: 'text-green-400',
  weaknesses: 'text-red-400',
  opportunities: 'text-blue-400',
  threats: 'text-orange-400',
};

export default function ComparisonSummaryPanel({ summary }: ComparisonSummaryPanelProps): React.JSX.Element {
  const categories: SwotCategory[] = ['strengths', 'weaknesses', 'opportunities', 'threats'];
  const totalChanges = summary.totalAdded + summary.totalRemoved + summary.totalChanged;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="mb-3 text-sm font-bold text-gray-300">Summary</h3>

      {totalChanges === 0 ? (
        <p className="text-sm text-gray-500">No changes detected between analyses.</p>
      ) : (
        <>
          <div className="mb-4 flex gap-4 text-sm">
            <span className="text-green-400">+{summary.totalAdded} added</span>
            <span className="text-red-400">-{summary.totalRemoved} removed</span>
            <span className="text-yellow-400">~{summary.totalChanged} changed</span>
          </div>

          <div className="space-y-2">
            {categories.map((cat) => {
              const catSummary = summary[cat];
              const catTotal = catSummary.added + catSummary.removed + catSummary.changed;
              if (catTotal === 0) return null;

              return (
                <div key={cat} className="flex items-center gap-3 text-xs">
                  <span className={`w-24 font-medium ${CATEGORY_COLORS[cat]}`}>
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <div className="flex gap-2 text-gray-400">
                    {catSummary.added > 0 && (
                      <span className="text-green-400">+{catSummary.added}</span>
                    )}
                    {catSummary.removed > 0 && (
                      <span className="text-red-400">-{catSummary.removed}</span>
                    )}
                    {catSummary.changed > 0 && (
                      <span className="text-yellow-400">~{catSummary.changed}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
