import { useState } from 'react';
import { useCurrentWorkspace } from '../hooks/use-workspace';
import { useComparisonAnalyses, useRunComparison } from '../hooks/use-comparison';
import AnalysisPicker from '../components/comparison/analysis-picker';
import DiffView from '../components/comparison/diff-view';
import ComparisonSummaryPanel from '../components/comparison/comparison-summary';
import ConfidenceTrend from '../components/visualizations/confidence-trend';

export default function ComparisonPage(): React.JSX.Element {
  const { data: workspace } = useCurrentWorkspace();
  const { data: analyses, isLoading: isLoadingAnalyses } = useComparisonAnalyses(!!workspace);
  const runComparison = useRunComparison();

  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);

  const handleCompare = () => {
    if (selectedA && selectedB) {
      runComparison.mutate({ analysisIdA: selectedA, analysisIdB: selectedB });
    }
  };

  if (!workspace) {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold">Compare Analyses</h2>
        <p className="text-gray-400">Open a workspace to compare analyses.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Compare Analyses</h2>

      {isLoadingAnalyses && <p className="text-gray-500">Loading analyses...</p>}

      {analyses && analyses.length < 2 && (
        <div className="rounded-lg border border-dashed border-gray-700 p-8 text-center">
          <p className="text-gray-400">
            At least two completed analyses are needed for comparison.
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Run analyses from the Analysis page first.
          </p>
        </div>
      )}

      {analyses && analyses.length >= 2 && (
        <AnalysisPicker
          analyses={analyses}
          selectedA={selectedA}
          selectedB={selectedB}
          onSelectA={setSelectedA}
          onSelectB={setSelectedB}
          onCompare={handleCompare}
          isComparing={runComparison.isPending}
        />
      )}

      {runComparison.isError && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-3">
          <p className="text-sm text-red-300">
            {runComparison.error instanceof Error
              ? runComparison.error.message
              : 'Comparison failed'}
          </p>
        </div>
      )}

      {runComparison.data && (
        <>
          <ComparisonSummaryPanel summary={runComparison.data.summary} />
          <ComparisonVisualization result={runComparison.data} />
          <DiffView result={runComparison.data} />
        </>
      )}
    </div>
  );
}

function ComparisonVisualization({ result }: { result: ComparisonResult }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  // Build confidence data from deltas for both analyses
  const confidenceDataA: Record<string, number> = { high: 0, medium: 0, low: 0 };
  const confidenceDataB: Record<string, number> = { high: 0, medium: 0, low: 0 };

  for (const delta of result.deltas) {
    if (delta.kind === 'removed') {
      const conf = delta.confidenceDelta?.before ?? 'medium';
      confidenceDataA[conf] = (confidenceDataA[conf] ?? 0) + 1;
    } else if (delta.kind === 'added') {
      const conf = delta.confidenceDelta?.after ?? 'medium';
      confidenceDataB[conf] = (confidenceDataB[conf] ?? 0) + 1;
    } else if (delta.kind === 'changed' && delta.confidenceDelta) {
      confidenceDataA[delta.confidenceDelta.before] = (confidenceDataA[delta.confidenceDelta.before] ?? 0) + 1;
      confidenceDataB[delta.confidenceDelta.after] = (confidenceDataB[delta.confidenceDelta.after] ?? 0) + 1;
    }
  }

  const hasConfidenceData =
    Object.values(confidenceDataA).some((v) => v > 0) ||
    Object.values(confidenceDataB).some((v) => v > 0);

  if (!hasConfidenceData) return <></>;

  const analyses = [
    {
      label: `Analysis A`,
      high: confidenceDataA['high'] ?? 0,
      medium: confidenceDataA['medium'] ?? 0,
      low: confidenceDataA['low'] ?? 0,
    },
    {
      label: `Analysis B`,
      high: confidenceDataB['high'] ?? 0,
      medium: confidenceDataB['medium'] ?? 0,
      low: confidenceDataB['low'] ?? 0,
    },
  ];

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <h4 className="text-sm font-medium text-gray-300">Comparison Visualizations</h4>
        <span className="text-xs text-gray-500">{expanded ? '\u25B2 Collapse' : '\u25BC Expand'}</span>
      </button>
      {expanded && (
        <div className="border-t border-gray-800 p-4">
          <h5 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
            Confidence Distribution (Changed Items)
          </h5>
          <ConfidenceTrend analyses={analyses} />
        </div>
      )}
    </div>
  );
}
