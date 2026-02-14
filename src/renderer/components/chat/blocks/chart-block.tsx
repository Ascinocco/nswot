import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Chart,
  BarController,
  LineController,
  PieController,
  DoughnutController,
  RadarController,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import type { ChartBlockData, ChartType } from '../../../../main/domain/content-block.types';

Chart.register(
  BarController,
  LineController,
  PieController,
  DoughnutController,
  RadarController,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
);

const CHART_TYPE_MAP: Record<ChartType, string> = {
  bar: 'bar',
  line: 'line',
  pie: 'pie',
  radar: 'radar',
  doughnut: 'doughnut',
};

interface ChartBlockProps {
  data: ChartBlockData;
}

export default function ChartBlock({ data }: ChartBlockProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const spec = data.spec as Record<string, unknown> | null;
    if (!spec) {
      setError('No chart data provided');
      return;
    }

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const chartType = CHART_TYPE_MAP[data.chartType] ?? 'bar';

    try {
      // Build dark-theme options, then deep-merge any LLM-supplied spec.options
      // so that the theme colors always win (LLM-generated options often use
      // black text which is invisible on a dark background).
      const specOptions = (spec.options ?? {}) as Record<string, unknown>;

      const darkScales = chartType === 'pie' || chartType === 'doughnut' || chartType === 'radar'
        ? {}
        : {
            x: {
              ...(((specOptions.scales as Record<string, unknown>) ?? {}) as Record<string, unknown>).x as Record<string, unknown> ?? {},
              ticks: { color: '#9ca3af' },
              grid: { color: 'rgba(75, 85, 99, 0.3)' },
            },
            y: {
              ...(((specOptions.scales as Record<string, unknown>) ?? {}) as Record<string, unknown>).y as Record<string, unknown> ?? {},
              ticks: { color: '#9ca3af' },
              grid: { color: 'rgba(75, 85, 99, 0.3)' },
            },
          };

      const mergedOptions = {
        ...specOptions,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          ...(specOptions.plugins as Record<string, unknown> ?? {}),
          legend: {
            ...((specOptions.plugins as Record<string, unknown> ?? {}).legend as Record<string, unknown> ?? {}),
            labels: { color: '#d1d5db', font: { size: 11 } },
          },
          tooltip: {
            ...((specOptions.plugins as Record<string, unknown> ?? {}).tooltip as Record<string, unknown> ?? {}),
            backgroundColor: '#1f2937',
            titleColor: '#e5e7eb',
            bodyColor: '#d1d5db',
            borderColor: '#374151',
            borderWidth: 1,
          },
        },
        scales: darkScales,
      };

      chartRef.current = new Chart(canvasRef.current, {
        type: chartType as 'bar',
        data: (spec.data ?? { labels: [], datasets: [] }) as never,
        options: mergedOptions,
      });
      setError(null);
    } catch (err) {
      console.error('[chart-block] Failed to create chart:', err);
      setError(err instanceof Error ? err.message : 'Failed to render chart');
      chartRef.current = null;
    }

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [data.chartType, data.spec]);

  const handleSaveAsPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.title ?? 'chart'}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [data.title]);

  return (
    <div className="my-3 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        {data.title && (
          <h4 className="text-sm font-medium text-gray-300">{data.title}</h4>
        )}
        {!error && (
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
          <p className="font-medium">Chart Error</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : (
        <div style={{ height: 240 }}>
          <canvas ref={canvasRef} />
        </div>
      )}
    </div>
  );
}
