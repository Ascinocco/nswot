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

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.15;

interface MermaidBlockProps {
  data: MermaidBlockData;
}

export default function MermaidBlock({ data }: MermaidBlockProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSvg, setHasSvg] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

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
          setZoom(1);
          setPan({ x: 0, y: 0 });
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

  /** Read the full diagram dimensions from the SVG viewBox or attributes. */
  const getSvgDimensions = useCallback((): { width: number; height: number } | null => {
    const svgEl = containerRef.current?.querySelector('svg');
    if (!svgEl) return null;

    // Prefer viewBox for the true content dimensions
    const viewBox = svgEl.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2]! > 0 && parts[3]! > 0) {
        return { width: parts[2]!, height: parts[3]! };
      }
    }

    // Fall back to explicit width/height attributes
    const w = parseFloat(svgEl.getAttribute('width') ?? '0');
    const h = parseFloat(svgEl.getAttribute('height') ?? '0');
    if (w > 0 && h > 0) return { width: w, height: h };

    // Last resort: bounding box
    const bbox = svgEl.getBoundingClientRect();
    return { width: bbox.width, height: bbox.height };
  }, []);

  const handleSaveAsPng = useCallback(() => {
    const svgEl = containerRef.current?.querySelector('svg');
    if (!svgEl) return;

    const dims = getSvgDimensions();
    if (!dims) return;

    // Clone the SVG and set explicit width/height so the Image renders at
    // full diagram size rather than the constrained container size.
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(dims.width));
    clone.setAttribute('height', String(dims.height));

    const svgData = new XMLSerializer().serializeToString(clone);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = 2;
    const img = new Image();
    img.onload = () => {
      canvas.width = dims.width * scale;
      canvas.height = dims.height * scale;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, dims.width, dims.height);
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
    img.onerror = () => {
      console.error('[mermaid-block] Failed to load SVG as image for PNG export');
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
  }, [data.title, getSvgDimensions]);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Only zoom on ctrl/cmd+wheel to avoid hijacking normal scroll
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    panOrigin.current = { ...pan };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPan({ x: panOrigin.current.x + dx, y: panOrigin.current.y + dy });
  }, []);

  const handlePointerUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="my-3 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        {data.title && (
          <h4 className="text-sm font-medium text-gray-300">{data.title}</h4>
        )}
        {hasSvg && !error && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleZoomOut}
              className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
              title="Zoom out"
            >
              -
            </button>
            <button
              onClick={handleResetView}
              className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors min-w-[40px]"
              title="Reset zoom"
            >
              {zoomPercent}%
            </button>
            <button
              onClick={handleZoomIn}
              className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
              title="Zoom in"
            >
              +
            </button>
            <button
              onClick={handleSaveAsPng}
              className="ml-1 rounded border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
              title="Save as PNG"
            >
              Save as PNG
            </button>
          </div>
        )}
      </div>
      {error ? (
        <div className="rounded border border-red-800 bg-red-900/20 p-2 text-xs text-red-400">
          <p className="font-medium">Diagram Error</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : (
        <div
          ref={viewportRef}
          className="overflow-hidden rounded border border-gray-800/50"
          style={{ height: 360, cursor: isPanning.current ? 'grabbing' : 'grab' }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div
            ref={containerRef}
            className="[&_svg]:mx-auto"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isPanning.current ? 'none' : 'transform 0.1s ease-out',
            }}
          />
        </div>
      )}
    </div>
  );
}
