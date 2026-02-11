import { useState } from 'react';
import { useCurrentWorkspace } from '../hooks/use-workspace';
import { useComparisonAnalyses, useRunComparison } from '../hooks/use-comparison';
import AnalysisPicker from '../components/comparison/analysis-picker';
import DiffView from '../components/comparison/diff-view';
import ComparisonSummaryPanel from '../components/comparison/comparison-summary';

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
          <DiffView result={runComparison.data} />
        </>
      )}
    </div>
  );
}
