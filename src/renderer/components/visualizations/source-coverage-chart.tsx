import { useEffect, useRef } from 'react';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

interface SourceCoverageChartProps {
  sourceTypeCoverage: Record<string, number>;
}

const SOURCE_LABELS: Record<string, string> = {
  profile: 'Profiles',
  jira: 'Jira',
  confluence: 'Confluence',
  github: 'GitHub',
  codebase: 'Codebase',
};

const SOURCE_COLORS: Record<string, string> = {
  profile: 'rgba(59, 130, 246, 0.7)',
  jira: 'rgba(16, 185, 129, 0.7)',
  confluence: 'rgba(245, 158, 11, 0.7)',
  github: 'rgba(139, 92, 246, 0.7)',
  codebase: 'rgba(236, 72, 153, 0.7)',
};

export default function SourceCoverageChart({ sourceTypeCoverage }: SourceCoverageChartProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const entries = Object.entries(sourceTypeCoverage).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return;

    const labels = entries.map(([key]) => SOURCE_LABELS[key] ?? key);
    const data = entries.map(([, count]) => count);
    const colors = entries.map(([key]) => SOURCE_COLORS[key] ?? 'rgba(156, 163, 175, 0.7)');

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors,
            borderColor: colors.map((c) => c.replace('0.7', '1')),
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.parsed.x} items`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              color: '#9ca3af',
            },
            grid: {
              color: 'rgba(75, 85, 99, 0.3)',
            },
          },
          y: {
            ticks: {
              color: '#d1d5db',
              font: { size: 12 },
            },
            grid: {
              display: false,
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [sourceTypeCoverage]);

  const entries = Object.entries(sourceTypeCoverage);
  if (entries.length === 0) {
    return <p className="text-sm italic text-gray-500">No source coverage data available.</p>;
  }

  const height = Math.max(120, entries.length * 36);

  return (
    <div style={{ height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
