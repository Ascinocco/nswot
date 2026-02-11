interface AnalysisPickerProps {
  analyses: ComparisonAnalysisSummary[];
  selectedA: string | null;
  selectedB: string | null;
  onSelectA: (id: string | null) => void;
  onSelectB: (id: string | null) => void;
  onCompare: () => void;
  isComparing: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  staff_engineer: 'Staff Engineer',
  senior_em: 'Senior EM',
  vp_engineering: 'VP Engineering',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AnalysisPicker({
  analyses,
  selectedA,
  selectedB,
  onSelectA,
  onSelectB,
  onCompare,
  isComparing,
}: AnalysisPickerProps): React.JSX.Element {
  const canCompare = selectedA && selectedB && selectedA !== selectedB;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">
            Baseline (older)
          </label>
          <AnalysisSelect
            analyses={analyses}
            selected={selectedA}
            onSelect={onSelectA}
            excludeId={selectedB}
            placeholder="Select baseline analysis..."
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">
            Current (newer)
          </label>
          <AnalysisSelect
            analyses={analyses}
            selected={selectedB}
            onSelect={onSelectB}
            excludeId={selectedA}
            placeholder="Select current analysis..."
          />
        </div>
      </div>

      <button
        onClick={onCompare}
        disabled={!canCompare || isComparing}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isComparing ? 'Comparing...' : 'Compare'}
      </button>
    </div>
  );
}

function AnalysisSelect({
  analyses,
  selected,
  onSelect,
  excludeId,
  placeholder,
}: {
  analyses: ComparisonAnalysisSummary[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  excludeId: string | null;
  placeholder: string;
}): React.JSX.Element {
  return (
    <select
      value={selected ?? ''}
      onChange={(e) => onSelect(e.target.value || null)}
      className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-600 focus:outline-none"
    >
      <option value="">{placeholder}</option>
      {analyses.map((a) => (
        <option key={a.id} value={a.id} disabled={a.id === excludeId}>
          {ROLE_LABELS[a.role] ?? a.role} — {a.modelId} — {formatDate(a.completedAt ?? a.createdAt)}
        </option>
      ))}
    </select>
  );
}
