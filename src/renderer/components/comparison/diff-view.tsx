const KIND_STYLES: Record<DeltaKind, { border: string; bg: string; label: string; labelStyle: string }> = {
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

const CATEGORY_LABELS: Record<SwotCategory, string> = {
  strengths: 'Strengths',
  weaknesses: 'Weaknesses',
  opportunities: 'Opportunities',
  threats: 'Threats',
};

const CATEGORY_STYLES: Record<SwotCategory, string> = {
  strengths: 'text-green-400',
  weaknesses: 'text-red-400',
  opportunities: 'text-blue-400',
  threats: 'text-orange-400',
};

const CONFIDENCE_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

interface DiffViewProps {
  result: ComparisonResult;
}

export default function DiffView({ result }: DiffViewProps): React.JSX.Element {
  const categories: SwotCategory[] = ['strengths', 'weaknesses', 'opportunities', 'threats'];

  return (
    <div className="space-y-6">
      {categories.map((category) => {
        const deltas = result.deltas.filter((d) => d.category === category);
        if (deltas.length === 0) return null;

        return (
          <div key={category}>
            <h4 className={`mb-3 text-sm font-bold uppercase tracking-wider ${CATEGORY_STYLES[category]}`}>
              {CATEGORY_LABELS[category]}
            </h4>
            <div className="space-y-2">
              {deltas.map((delta, i) => (
                <DeltaCard key={i} delta={delta} />
              ))}
            </div>
          </div>
        );
      })}

      {result.deltas.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-700 p-8 text-center">
          <p className="text-gray-400">No differences found between these analyses.</p>
        </div>
      )}
    </div>
  );
}

function DeltaCard({ delta }: { delta: ItemDelta }): React.JSX.Element {
  const styles = KIND_STYLES[delta.kind];

  return (
    <div className={`rounded-lg border ${styles.border} ${styles.bg} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm text-gray-200">{delta.claim}</p>
          {delta.kind === 'changed' && delta.matchedClaim && delta.matchedClaim !== delta.claim && (
            <p className="mt-1 text-xs text-gray-500">
              Previously: &ldquo;{delta.matchedClaim}&rdquo;
            </p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${styles.labelStyle}`}>
          {styles.label}
        </span>
      </div>

      {delta.kind === 'changed' && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          {delta.confidenceDelta && (
            <ConfidenceChange delta={delta.confidenceDelta} />
          )}
          {delta.evidenceCountDelta && (
            <span className="text-gray-400">
              Evidence: {delta.evidenceCountDelta.before} &rarr; {delta.evidenceCountDelta.after}
            </span>
          )}
          {delta.sourceDelta && (
            <SourceChange delta={delta.sourceDelta} />
          )}
          {delta.similarity !== undefined && (
            <span className="text-gray-600">
              Match: {Math.round(delta.similarity * 100)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ConfidenceChange({ delta }: { delta: ConfidenceDelta }): React.JSX.Element {
  const improved = CONFIDENCE_RANK[delta.after]! > CONFIDENCE_RANK[delta.before]!;
  const color = improved ? 'text-green-400' : 'text-red-400';
  const arrow = improved ? '\u2191' : '\u2193';

  return (
    <span className={color}>
      Confidence: {delta.before} {arrow} {delta.after}
    </span>
  );
}

function SourceChange({ delta }: { delta: SourceDelta }): React.JSX.Element {
  return (
    <span className="text-gray-400">
      {delta.added.length > 0 && (
        <span className="text-green-400">+{delta.added.join(', ')}</span>
      )}
      {delta.added.length > 0 && delta.removed.length > 0 && ' '}
      {delta.removed.length > 0 && (
        <span className="text-red-400">-{delta.removed.join(', ')}</span>
      )}
    </span>
  );
}
