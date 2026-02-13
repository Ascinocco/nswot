import type { QualityMetricsBlockData } from '../../../../main/domain/content-block.types';

const SCORE_COLORS: Record<string, string> = {
  high: 'text-green-400 bg-green-900/30 border-green-700',
  medium: 'text-yellow-400 bg-yellow-900/30 border-yellow-700',
  low: 'text-red-400 bg-red-900/30 border-red-700',
};

const SOURCE_LABELS: Record<string, string> = {
  profile: 'Profiles',
  jira: 'Jira',
  confluence: 'Confluence',
  github: 'GitHub',
  codebase: 'Codebase',
};

function getScoreLevel(score: number): string {
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

interface MetricsBlockProps {
  data: QualityMetricsBlockData;
}

export default function MetricsBlock({ data }: MetricsBlockProps): React.JSX.Element {
  const level = getScoreLevel(data.qualityScore);
  const scoreColor = SCORE_COLORS[level] ?? SCORE_COLORS['low']!;

  return (
    <div className="my-3 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-300">Evidence Quality</h4>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreColor}`}>
          {data.qualityScore}/100
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-500">Total SWOT items</span>
          <p className="font-medium text-gray-300">{data.totalItems}</p>
        </div>
        <div>
          <span className="text-gray-500">Multi-source items</span>
          <p className="font-medium text-gray-300">
            {data.multiSourceItems} of {data.totalItems}
            {data.totalItems > 0 && (
              <span className="ml-1 text-gray-500">
                ({Math.round((data.multiSourceItems / data.totalItems) * 100)}%)
              </span>
            )}
          </p>
        </div>
        <div>
          <span className="text-gray-500">Avg evidence/item</span>
          <p className="font-medium text-gray-300">{data.averageEvidencePerItem}</p>
        </div>
        <div>
          <span className="text-gray-500">Confidence</span>
          <div className="flex gap-2">
            <span className="text-green-400">{data.confidenceDistribution.high}H</span>
            <span className="text-yellow-400">{data.confidenceDistribution.medium}M</span>
            <span className="text-red-400">{data.confidenceDistribution.low}L</span>
          </div>
        </div>
      </div>

      {Object.keys(data.sourceTypeCoverage).length > 0 && (
        <div className="mt-2 border-t border-gray-800 pt-2">
          <span className="text-[10px] text-gray-500">Evidence coverage by source</span>
          <div className="mt-1 space-y-1">
            {Object.entries(data.sourceTypeCoverage).map(([source, count]) => {
              const pct = data.totalItems > 0 ? Math.round((count / data.totalItems) * 100) : 0;
              return (
                <div key={source} className="flex items-center gap-2">
                  <span className="w-16 text-[10px] text-gray-400">
                    {SOURCE_LABELS[source] ?? source}
                  </span>
                  <div className="flex-1">
                    <div className="h-1.5 rounded-full bg-gray-800">
                      <div
                        className="h-1.5 rounded-full bg-blue-600/70"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-20 text-right text-[10px] text-gray-500">
                    {count}/{data.totalItems} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
