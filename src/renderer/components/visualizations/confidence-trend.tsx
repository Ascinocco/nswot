import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface ConfidenceData {
  label: string;
  high: number;
  medium: number;
  low: number;
}

interface ConfidenceTrendProps {
  analyses: ConfidenceData[];
}

export default function ConfidenceTrend({ analyses }: ConfidenceTrendProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || analyses.length === 0) return;

    const labels = analyses.map((a) => a.label);

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'High',
            data: analyses.map((a) => a.high),
            backgroundColor: 'rgba(34, 197, 94, 0.7)',
            borderColor: 'rgba(34, 197, 94, 1)',
            borderWidth: 1,
            borderRadius: 2,
          },
          {
            label: 'Medium',
            data: analyses.map((a) => a.medium),
            backgroundColor: 'rgba(234, 179, 8, 0.7)',
            borderColor: 'rgba(234, 179, 8, 1)',
            borderWidth: 1,
            borderRadius: 2,
          },
          {
            label: 'Low',
            data: analyses.map((a) => a.low),
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderColor: 'rgba(239, 68, 68, 1)',
            borderWidth: 1,
            borderRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            mode: 'index',
            intersect: false,
          },
          legend: {
            position: 'top',
            labels: {
              color: '#9ca3af',
              font: { size: 11 },
              padding: 12,
              usePointStyle: true,
              pointStyle: 'rectRounded',
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: {
              color: '#d1d5db',
              font: { size: 11 },
            },
            grid: {
              display: false,
            },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              color: '#9ca3af',
            },
            grid: {
              color: 'rgba(75, 85, 99, 0.3)',
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [analyses]);

  if (analyses.length === 0) {
    return <p className="text-sm italic text-gray-500">No confidence data available.</p>;
  }

  return (
    <div style={{ height: 220 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
