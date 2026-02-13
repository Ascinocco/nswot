import { useState } from 'react';

interface ThinkingBlockProps {
  thinking: string;
  isStreaming?: boolean;
}

export default function ThinkingBlock({
  thinking,
  isStreaming = false,
}: ThinkingBlockProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-2 rounded-lg border border-gray-700/50 bg-gray-800/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-400 hover:text-gray-300 transition-colors"
      >
        {isStreaming ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-purple-400" />
        ) : (
          <svg
            className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
        <span className="font-medium">
          {isStreaming ? 'Thinking...' : 'Thinking'}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-gray-700/50 px-3 py-2">
          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-gray-400">
            {thinking}
          </pre>
        </div>
      )}
    </div>
  );
}
