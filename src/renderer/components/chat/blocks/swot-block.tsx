import type { SwotAnalysisBlockData } from '../../../../main/domain/content-block.types';

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'bg-green-900/50 text-green-300 border-green-700',
  medium: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  low: 'bg-red-900/50 text-red-300 border-red-700',
};

const QUADRANT_STYLES: Record<string, { border: string; bg: string; text: string }> = {
  strengths: { border: 'border-green-800', bg: 'bg-green-900/10', text: 'text-green-400' },
  weaknesses: { border: 'border-red-800', bg: 'bg-red-900/10', text: 'text-red-400' },
  opportunities: { border: 'border-blue-800', bg: 'bg-blue-900/10', text: 'text-blue-400' },
  threats: { border: 'border-orange-800', bg: 'bg-orange-900/10', text: 'text-orange-400' },
};

interface SwotBlockProps {
  data: SwotAnalysisBlockData;
}

export default function SwotBlock({ data }: SwotBlockProps): React.JSX.Element {
  const quadrants: [string, string, SwotItem[]][] = [
    ['Strengths', 'strengths', data.strengths],
    ['Weaknesses', 'weaknesses', data.weaknesses],
    ['Opportunities', 'opportunities', data.opportunities],
    ['Threats', 'threats', data.threats],
  ];

  return (
    <div className="my-3 space-y-3">
      <h4 className="text-sm font-bold text-gray-200">SWOT Analysis</h4>
      <div className="grid grid-cols-2 gap-3">
        {quadrants.map(([title, key, items]) => {
          const styles = QUADRANT_STYLES[key]!;
          return (
            <div key={key} className={`rounded-lg border ${styles.border} ${styles.bg} p-3`}>
              <h5 className={`mb-2 text-xs font-bold uppercase tracking-wider ${styles.text}`}>
                {title} ({items.length})
              </h5>
              {items.length === 0 ? (
                <p className="text-xs italic text-gray-500">None identified</p>
              ) : (
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <SwotItemCard key={i} item={item} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SwotItemCard({ item }: { item: SwotItem }): React.JSX.Element {
  const confidenceStyle = CONFIDENCE_STYLES[item.confidence] ?? CONFIDENCE_STYLES['low'];

  return (
    <div className="rounded border border-gray-800 bg-gray-950/50 p-2">
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-gray-200">{item.claim}</p>
        <span
          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase ${confidenceStyle}`}
        >
          {item.confidence}
        </span>
      </div>

      {item.evidence.length > 0 && (
        <div className="mb-1 space-y-0.5">
          {item.evidence.slice(0, 2).map((e, i) => (
            <div key={i} className="flex gap-1 text-[10px]">
              <span className="shrink-0 rounded bg-gray-800 px-1 py-0.5 font-mono text-gray-400">
                {e.sourceId}
              </span>
              <span className="truncate italic text-gray-500">&ldquo;{e.quote}&rdquo;</span>
            </div>
          ))}
          {item.evidence.length > 2 && (
            <span className="text-[10px] text-gray-600">+{item.evidence.length - 2} more</span>
          )}
        </div>
      )}

      <div className="space-y-0.5 text-[10px]">
        <p className="text-gray-400">
          <span className="font-medium text-gray-300">Impact:</span> {item.impact}
        </p>
        <p className="text-gray-400">
          <span className="font-medium text-gray-300">Action:</span> {item.recommendation}
        </p>
      </div>
    </div>
  );
}
