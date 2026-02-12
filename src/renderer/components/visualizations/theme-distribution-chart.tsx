import { useEffect, useRef } from 'react';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

interface ThemeDistributionChartProps {
  themes: Theme[];
}

const BAR_COLORS = [
  'rgba(59, 130, 246, 0.7)',  // blue
  'rgba(16, 185, 129, 0.7)',  // green
  'rgba(245, 158, 11, 0.7)',  // amber
  'rgba(239, 68, 68, 0.7)',   // red
  'rgba(139, 92, 246, 0.7)',  // violet
  'rgba(236, 72, 153, 0.7)',  // pink
  'rgba(14, 165, 233, 0.7)',  // sky
  'rgba(168, 162, 158, 0.7)', // stone
];

export default function ThemeDistributionChart({ themes }: ThemeDistributionChartProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || themes.length === 0) return;

    const sorted = [...themes].sort((a, b) => b.frequency - a.frequency);
    const labels = sorted.map((t) =>
      t.label.length > 25 ? t.label.slice(0, 22) + '...' : t.label,
    );
    const data = sorted.map((t) => t.frequency);
    const colors = sorted.map((_, i) => BAR_COLORS[i % BAR_COLORS.length]!);

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
              title: (items) => {
                const idx = items[0]?.dataIndex ?? 0;
                return sorted[idx]?.label ?? '';
              },
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
              font: { size: 11 },
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
  }, [themes]);

  if (themes.length === 0) {
    return <p className="text-sm italic text-gray-500">No themes extracted for this analysis.</p>;
  }

  const height = Math.max(150, themes.length * 32);

  return (
    <div style={{ height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
