interface QualityMetricsProps {
  metrics: EvidenceQualityMetrics;
}

const SCORE_COLORS: Record<string, string> = {
  high: 'text-green-400 bg-green-900/30 border-green-700',
  medium: 'text-yellow-400 bg-yellow-900/30 border-yellow-700',
  low: 'text-red-400 bg-red-900/30 border-red-700',
};

function getScoreLevel(score: number): string {
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

const SOURCE_LABELS: Record<string, string> = {
  profile: 'Profiles',
  jira: 'Jira',
  confluence: 'Confluence',
  github: 'GitHub',
  codebase: 'Codebase',
};

export default function QualityMetrics({ metrics }: QualityMetricsProps): React.JSX.Element {
  const level = getScoreLevel(metrics.qualityScore);
  const scoreColor = SCORE_COLORS[level] ?? SCORE_COLORS['low']!;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">Evidence Quality</h3>
        <span className={`rounded-full border px-3 py-0.5 text-sm font-semibold ${scoreColor}`}>
          {metrics.qualityScore}/100
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {/* Total items */}
        <div>
          <span className="text-gray-500">Total SWOT items</span>
          <p className="font-medium text-gray-300">{metrics.totalItems}</p>
        </div>

        {/* Multi-source items */}
        <div>
          <span className="text-gray-500">Multi-source items</span>
          <p className="font-medium text-gray-300">
            {metrics.multiSourceItems} of {metrics.totalItems}
            {metrics.totalItems > 0 && (
              <span className="ml-1 text-xs text-gray-500">
                ({Math.round((metrics.multiSourceItems / metrics.totalItems) * 100)}%)
              </span>
            )}
          </p>
        </div>

        {/* Avg evidence per item */}
        <div>
          <span className="text-gray-500">Avg evidence/item</span>
          <p className="font-medium text-gray-300">{metrics.averageEvidencePerItem}</p>
        </div>

        {/* Confidence distribution */}
        <div>
          <span className="text-gray-500">Confidence</span>
          <div className="flex gap-2">
            <span className="text-green-400">{metrics.confidenceDistribution.high}H</span>
            <span className="text-yellow-400">{metrics.confidenceDistribution.medium}M</span>
            <span className="text-red-400">{metrics.confidenceDistribution.low}L</span>
          </div>
        </div>
      </div>

      {/* Source coverage */}
      {Object.keys(metrics.sourceTypeCoverage).length > 0 && (
        <div className="mt-3 border-t border-gray-800 pt-3">
          <span className="text-xs text-gray-500">Source coverage (items citing each)</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {Object.entries(metrics.sourceTypeCoverage).map(([source, count]) => (
              <span
                key={source}
                className="rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-gray-400"
              >
                {SOURCE_LABELS[source] ?? source}: {count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
