import { useEffect, useRef } from 'react';
import {
  Chart,
  RadarController,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js';

Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip);

interface CoverageRadarChartProps {
  sourceTypeCoverage: Record<string, number>;
  totalItems: number;
}

const SOURCE_LABELS: Record<string, string> = {
  profile: 'Profiles',
  jira: 'Jira',
  confluence: 'Confluence',
  github: 'GitHub',
  codebase: 'Codebase',
};

export default function CoverageRadarChart({
  sourceTypeCoverage,
  totalItems,
}: CoverageRadarChartProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const entries = Object.entries(sourceTypeCoverage);
    if (entries.length < 3) return; // Radar needs at least 3 axes

    const labels = entries.map(([key]) => SOURCE_LABELS[key] ?? key);
    const data = entries.map(([, count]) => (totalItems > 0 ? (count / totalItems) * 100 : 0));

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'radar',
      data: {
        labels,
        datasets: [
          {
            label: 'Coverage %',
            data,
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            borderColor: 'rgba(59, 130, 246, 0.8)',
            borderWidth: 2,
            pointBackgroundColor: 'rgba(59, 130, 246, 1)',
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => `${Math.round(ctx.parsed.r)}% of items`,
            },
          },
        },
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: {
              stepSize: 25,
              color: '#6b7280',
              backdropColor: 'transparent',
              font: { size: 10 },
            },
            grid: {
              color: 'rgba(75, 85, 99, 0.3)',
            },
            angleLines: {
              color: 'rgba(75, 85, 99, 0.3)',
            },
            pointLabels: {
              color: '#d1d5db',
              font: { size: 12 },
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [sourceTypeCoverage, totalItems]);

  const entries = Object.entries(sourceTypeCoverage);
  if (entries.length < 3) {
    return (
      <p className="text-sm italic text-gray-500">
        At least 3 source types needed for radar chart.
      </p>
    );
  }

  return (
    <div className="mx-auto" style={{ maxWidth: 320, maxHeight: 320 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
