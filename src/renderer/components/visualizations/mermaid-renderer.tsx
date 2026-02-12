import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidRendererProps {
  content: string;
  className?: string;
}

let mermaidInitialized = false;

function initMermaid(): void {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      primaryColor: '#1e3a5f',
      primaryTextColor: '#e5e7eb',
      primaryBorderColor: '#4b5563',
      lineColor: '#6b7280',
      secondaryColor: '#1e293b',
      tertiaryColor: '#0f172a',
    },
    fontFamily: 'ui-monospace, monospace',
    fontSize: 14,
  });
  mermaidInitialized = true;
}

export default function MermaidRenderer({ content, className }: MermaidRendererProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!content.trim() || !containerRef.current) return;

    initMermaid();

    const id = `mermaid-${Date.now()}`;
    let cancelled = false;

    mermaid
      .render(id, content.trim())
      .then(({ svg }) => {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [content]);

  if (error) {
    return (
      <div className={`rounded border border-red-800 bg-red-900/20 p-3 text-sm text-red-400 ${className ?? ''}`}>
        <p className="font-medium">Diagram Error</p>
        <p className="mt-1 text-xs">{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full ${className ?? ''}`}
    />
  );
}
