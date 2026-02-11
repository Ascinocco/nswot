import Markdown from 'react-markdown';
import QualityMetrics from './quality-metrics';

interface SwotResultsProps {
  analysis: Analysis;
}

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

export default function SwotResults({ analysis }: SwotResultsProps): React.JSX.Element {
  const swot = analysis.swotOutput;
  if (!swot) return <></>;

  const quadrants: [string, string, SwotItem[]][] = [
    ['Strengths', 'strengths', swot.strengths],
    ['Weaknesses', 'weaknesses', swot.weaknesses],
    ['Opportunities', 'opportunities', swot.opportunities],
    ['Threats', 'threats', swot.threats],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">SWOT Results</h3>
        {analysis.warning && (
          <span className="rounded-full bg-yellow-900/50 px-3 py-1 text-xs text-yellow-300">
            {analysis.warning}
          </span>
        )}
      </div>

      {/* Quality Metrics */}
      {analysis.qualityMetrics && (
        <QualityMetrics metrics={analysis.qualityMetrics} />
      )}

      {/* Summaries */}
      {analysis.summariesOutput && (
        <div className="grid grid-cols-2 gap-4">
          <SummaryCard title="Stakeholder Themes" content={analysis.summariesOutput.profiles} />
          <SummaryCard title="Jira Patterns" content={analysis.summariesOutput.jira} />
          {analysis.summariesOutput.confluence && (
            <SummaryCard title="Confluence Patterns" content={analysis.summariesOutput.confluence} />
          )}
          {analysis.summariesOutput.github && (
            <SummaryCard title="GitHub Patterns" content={analysis.summariesOutput.github} />
          )}
        </div>
      )}

      {/* Quadrants */}
      <div className="grid grid-cols-2 gap-4">
        {quadrants.map(([title, key, items]) => {
          const styles = QUADRANT_STYLES[key]!;
          return (
            <div key={key} className={`rounded-lg border ${styles.border} ${styles.bg} p-4`}>
              <h4 className={`mb-3 text-sm font-bold uppercase tracking-wider ${styles.text}`}>
                {title} ({items.length})
              </h4>
              {items.length === 0 ? (
                <p className="text-sm italic text-gray-500">None identified</p>
              ) : (
                <div className="space-y-4">
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

function SummaryCard({ title, content }: { title: string; content: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h4 className="mb-2 text-sm font-medium text-gray-300">{title}</h4>
      <div className="prose prose-sm prose-invert max-w-none text-gray-400 prose-headings:text-gray-300 prose-strong:text-gray-300 prose-li:text-gray-400 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
        <Markdown>{content}</Markdown>
      </div>
    </div>
  );
}

function SwotItemCard({ item }: { item: SwotItem }): React.JSX.Element {
  const confidenceStyle = CONFIDENCE_STYLES[item.confidence] ?? CONFIDENCE_STYLES['low'];

  return (
    <div className="rounded border border-gray-800 bg-gray-950/50 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-200">{item.claim}</p>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${confidenceStyle}`}
        >
          {item.confidence}
        </span>
      </div>

      {/* Evidence */}
      <div className="mb-2 space-y-1">
        {item.evidence.map((e, i) => (
          <div key={i} className="flex gap-2 text-xs">
            <span className="shrink-0 rounded bg-gray-800 px-1.5 py-0.5 font-mono text-gray-400">
              {e.sourceId}
            </span>
            <span className="italic text-gray-500">"{e.quote}"</span>
          </div>
        ))}
      </div>

      {/* Impact & Recommendation */}
      <div className="space-y-1 text-xs">
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
