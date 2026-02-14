import { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import type { MermaidBlockData } from '../../../../main/domain/content-block.types';

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

interface MermaidBlockProps {
  data: MermaidBlockData;
}

export default function MermaidBlock({ data }: MermaidBlockProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSvg, setHasSvg] = useState(false);

  useEffect(() => {
    if (!data.source.trim() || !containerRef.current) return;

    initMermaid();

    const id = `mermaid-block-${crypto.randomUUID()}`;
    let cancelled = false;

    mermaid
      .render(id, data.source.trim())
      .then(({ svg }) => {
        if (!cancelled && containerRef.current) {
          // Allow both SVG and HTML profiles: Mermaid renders node labels
          // inside <foreignObject> with HTML elements (div, span, etc.).
          // SVG-only profile strips foreignObject, hiding all text labels.
          // DOMPurify still strips scripts, event handlers, and JS URIs.
          containerRef.current.innerHTML = DOMPurify.sanitize(svg, {
            USE_PROFILES: { svg: true, svgFilters: true, html: true },
            ADD_TAGS: ['foreignObject'],
          });
          setError(null);
          setHasSvg(true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
          setHasSvg(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [data.source]);

  const handleSaveAsPng = useCallback(() => {
    const svgEl = containerRef.current?.querySelector('svg');
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth * 2;
      canvas.height = img.naturalHeight * 2;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${data.title ?? 'diagram'}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
  }, [data.title]);

  return (
    <div className="my-3 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        {data.title && (
          <h4 className="text-sm font-medium text-gray-300">{data.title}</h4>
        )}
        {hasSvg && !error && (
          <button
            onClick={handleSaveAsPng}
            className="rounded border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
            title="Save as PNG"
          >
            Save as PNG
          </button>
        )}
      </div>
      {error ? (
        <div className="rounded border border-red-800 bg-red-900/20 p-2 text-xs text-red-400">
          <p className="font-medium">Diagram Error</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full"
        />
      )}
    </div>
  );
}
