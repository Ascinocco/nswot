import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface SwotHeatmapProps {
  swotOutput: SwotOutput;
}

interface CellData {
  category: string;
  confidence: string;
  count: number;
}

const CATEGORIES: SwotCategory[] = ['strengths', 'weaknesses', 'opportunities', 'threats'];
const CATEGORY_LABELS: Record<string, string> = {
  strengths: 'Strengths',
  weaknesses: 'Weaknesses',
  opportunities: 'Opportunities',
  threats: 'Threats',
};
const CONFIDENCE_LEVELS = ['high', 'medium', 'low'];

function buildCells(swot: SwotOutput): CellData[] {
  const cells: CellData[] = [];
  for (const category of CATEGORIES) {
    const items = swot[category];
    const counts: Record<string, number> = { high: 0, medium: 0, low: 0 };
    for (const item of items) {
      counts[item.confidence] = (counts[item.confidence] ?? 0) + 1;
    }
    for (const confidence of CONFIDENCE_LEVELS) {
      cells.push({ category, confidence, count: counts[confidence] ?? 0 });
    }
  }
  return cells;
}

export default function SwotHeatmap({ swotOutput }: SwotHeatmapProps): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const cells = buildCells(swotOutput);
    const maxCount = Math.max(...cells.map((c) => c.count), 1);

    const margin = { top: 30, right: 10, bottom: 10, left: 100 };
    const cellSize = 44;
    const gap = 4;
    const width = margin.left + CONFIDENCE_LEVELS.length * (cellSize + gap) + margin.right;
    const height = margin.top + CATEGORIES.length * (cellSize + gap) + margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const colorScale = d3
      .scaleLinear<string>()
      .domain([0, maxCount * 0.5, maxCount])
      .range(['#7f1d1d', '#854d0e', '#14532d'])
      .clamp(true);

    // Column headers
    svg
      .selectAll('.col-label')
      .data(CONFIDENCE_LEVELS)
      .join('text')
      .attr('class', 'col-label')
      .attr('x', (_, i) => margin.left + i * (cellSize + gap) + cellSize / 2)
      .attr('y', margin.top - 10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#9ca3af')
      .attr('font-size', 11)
      .text((d) => d.charAt(0).toUpperCase() + d.slice(1));

    // Row labels
    svg
      .selectAll('.row-label')
      .data(CATEGORIES)
      .join('text')
      .attr('class', 'row-label')
      .attr('x', margin.left - 8)
      .attr('y', (_, i) => margin.top + i * (cellSize + gap) + cellSize / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#d1d5db')
      .attr('font-size', 12)
      .text((d) => CATEGORY_LABELS[d] ?? d);

    // Cells
    const cellGroup = svg
      .selectAll('.cell')
      .data(cells)
      .join('g')
      .attr('class', 'cell')
      .attr('transform', (d) => {
        const col = CONFIDENCE_LEVELS.indexOf(d.confidence);
        const row = CATEGORIES.indexOf(d.category as SwotCategory);
        return `translate(${margin.left + col * (cellSize + gap)}, ${margin.top + row * (cellSize + gap)})`;
      });

    cellGroup
      .append('rect')
      .attr('width', cellSize)
      .attr('height', cellSize)
      .attr('rx', 4)
      .attr('fill', (d) => (d.count === 0 ? '#1f2937' : colorScale(d.count)))
      .attr('stroke', '#374151')
      .attr('stroke-width', 1);

    cellGroup
      .append('text')
      .attr('x', cellSize / 2)
      .attr('y', cellSize / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', (d) => (d.count === 0 ? '#4b5563' : '#e5e7eb'))
      .attr('font-size', 14)
      .attr('font-weight', 'bold')
      .text((d) => d.count);
  }, [swotOutput]);

  return <svg ref={svgRef} />;
}
