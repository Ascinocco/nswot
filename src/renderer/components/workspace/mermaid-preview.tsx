import { useState } from 'react';
import MermaidRenderer from '../visualizations/mermaid-renderer';

interface MermaidPreviewProps {
  content: string;
  filePath: string;
}

export default function MermaidPreview({ content, filePath }: MermaidPreviewProps): React.JSX.Element {
  const [showSource, setShowSource] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <span className="text-sm text-gray-400">{filePath}</span>
        <button
          onClick={() => setShowSource(!showSource)}
          className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-700"
        >
          {showSource ? 'Preview' : 'Source'}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {showSource ? (
          <pre className="whitespace-pre-wrap text-sm text-gray-300">{content}</pre>
        ) : (
          <MermaidRenderer content={content} className="min-h-[200px]" />
        )}
      </div>
    </div>
  );
}
