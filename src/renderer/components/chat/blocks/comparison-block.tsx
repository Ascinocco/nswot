import type { ComparisonBlockData } from '../../../../main/domain/content-block.types';

const KIND_STYLES: Record<string, { border: string; bg: string; label: string; labelStyle: string }> = {
  added: {
    border: 'border-green-800',
    bg: 'bg-green-900/10',
    label: 'Added',
    labelStyle: 'bg-green-900/50 text-green-300',
  },
  removed: {
    border: 'border-red-800',
    bg: 'bg-red-900/10',
    label: 'Removed',
    labelStyle: 'bg-red-900/50 text-red-300',
  },
  changed: {
    border: 'border-yellow-800',
    bg: 'bg-yellow-900/10',
    label: 'Changed',
    labelStyle: 'bg-yellow-900/50 text-yellow-300',
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  strengths: 'Strengths',
  weaknesses: 'Weaknesses',
  opportunities: 'Opportunities',
  threats: 'Threats',
};

const CATEGORY_STYLES: Record<string, string> = {
  strengths: 'text-green-400',
  weaknesses: 'text-red-400',
  opportunities: 'text-blue-400',
  threats: 'text-orange-400',
};

interface DiffDelta {
  kind: string;
  category: string;
  claim: string;
  matchedClaim?: string;
  similarity?: number;
  confidenceDelta?: { before: string; after: string };
  evidenceCountDelta?: { before: number; after: number };
  sourceDelta?: { added: string[]; removed: string[] };
}

interface DiffData {
  deltas?: DiffDelta[];
  summary?: {
    totalAdded?: number;
    totalRemoved?: number;
    totalChanged?: number;
  };
}

interface ComparisonBlockProps {
  data: ComparisonBlockData;
}

export default function ComparisonBlock({ data }: ComparisonBlockProps): React.JSX.Element {
  const diff = (data.diff ?? {}) as DiffData;
  const deltas = diff.deltas ?? [];
  const summary = diff.summary;
  const categories: string[] = ['strengths', 'weaknesses', 'opportunities', 'threats'];

  return (
    <div className="my-3 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
      <h4 className="mb-2 text-sm font-medium text-gray-300">Analysis Comparison</h4>

      {summary && (
        <div className="mb-3 flex gap-3 text-xs">
          {(summary.totalAdded ?? 0) > 0 && (
            <span className="text-green-400">+{summary.totalAdded} added</span>
          )}
          {(summary.totalRemoved ?? 0) > 0 && (
            <span className="text-red-400">-{summary.totalRemoved} removed</span>
          )}
          {(summary.totalChanged ?? 0) > 0 && (
            <span className="text-yellow-400">~{summary.totalChanged} changed</span>
          )}
        </div>
      )}

      {deltas.length === 0 ? (
        <p className="text-xs italic text-gray-500">No differences found between analyses.</p>
      ) : (
        <div className="space-y-3">
          {categories.map((category) => {
            const catDeltas = deltas.filter((d) => d.category === category);
            if (catDeltas.length === 0) return null;
            return (
              <div key={category}>
                <h5 className={`mb-1 text-xs font-bold uppercase tracking-wider ${CATEGORY_STYLES[category] ?? 'text-gray-400'}`}>
                  {CATEGORY_LABELS[category] ?? category}
                </h5>
                <div className="space-y-1">
                  {catDeltas.map((delta, i) => (
                    <DeltaCard key={i} delta={delta} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeltaCard({ delta }: { delta: DiffDelta }): React.JSX.Element {
  const styles = KIND_STYLES[delta.kind] ?? KIND_STYLES['changed']!;

  return (
    <div className={`rounded border ${styles.border} ${styles.bg} p-2`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-gray-200">{delta.claim}</p>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase ${styles.labelStyle}`}>
          {styles.label}
        </span>
      </div>

      {delta.kind === 'changed' && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
          {delta.confidenceDelta && (
            <span className={delta.confidenceDelta.after === 'high' ? 'text-green-400' : 'text-red-400'}>
              Confidence: {delta.confidenceDelta.before} &rarr; {delta.confidenceDelta.after}
            </span>
          )}
          {delta.evidenceCountDelta && (
            <span className="text-gray-400">
              Evidence: {delta.evidenceCountDelta.before} &rarr; {delta.evidenceCountDelta.after}
            </span>
          )}
          {delta.sourceDelta && (
            <span className="text-gray-400">
              {delta.sourceDelta.added.length > 0 && (
                <span className="text-green-400">+{delta.sourceDelta.added.join(', ')}</span>
              )}
              {delta.sourceDelta.added.length > 0 && delta.sourceDelta.removed.length > 0 && ' '}
              {delta.sourceDelta.removed.length > 0 && (
                <span className="text-red-400">-{delta.sourceDelta.removed.join(', ')}</span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
