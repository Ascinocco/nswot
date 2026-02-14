import type { ToolExecutionOutput } from '../../services/agent.service';
import type { ContentBlock } from '../../domain/content-block.types';
import type {
  SwotAnalysisBlockData,
  SummaryCardsBlockData,
  QualityMetricsBlockData,
  MermaidBlockData,
  ChartBlockData,
  DataTableBlockData,
  ComparisonBlockData,
} from '../../domain/content-block.types';
import type { ComparisonService } from '../../services/comparison.service';
import { generateBlockId } from '../../services/agent.service';

/**
 * Render tool executor: maps render tool calls to ContentBlock creation.
 *
 * Render tools produce UI content blocks that the agent harness captures.
 * They do not call external services, do not require approval, and never
 * return content strings — only blocks.
 *
 * The exception is `render_comparison`, which delegates to ComparisonService
 * for the actual diff computation.
 */
export class RenderExecutor {
  constructor(private readonly comparisonService?: ComparisonService) {}

  async execute(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionOutput> {
    switch (toolName) {
      case 'render_swot_analysis':
        return this.renderSwotAnalysis(input);
      case 'render_summary_cards':
        return this.renderSummaryCards(input);
      case 'render_quality_metrics':
        return this.renderQualityMetrics(input);
      case 'render_mermaid':
        return this.renderMermaid(input);
      case 'render_chart':
        return this.renderChart(input);
      case 'render_data_table':
        return this.renderDataTable(input);
      case 'render_comparison':
        return this.renderComparison(input);
      default:
        return { content: JSON.stringify({ error: `Unknown render tool: ${toolName}` }) };
    }
  }

  private renderSwotAnalysis(input: Record<string, unknown>): ToolExecutionOutput {
    const strengths = input.strengths;
    const weaknesses = input.weaknesses;
    const opportunities = input.opportunities;
    const threats = input.threats;

    if (!Array.isArray(strengths) || !Array.isArray(weaknesses) ||
        !Array.isArray(opportunities) || !Array.isArray(threats)) {
      return { content: JSON.stringify({ error: 'render_swot_analysis requires strengths, weaknesses, opportunities, and threats arrays' }) };
    }

    const data: SwotAnalysisBlockData = {
      strengths: strengths as SwotAnalysisBlockData['strengths'],
      weaknesses: weaknesses as SwotAnalysisBlockData['weaknesses'],
      opportunities: opportunities as SwotAnalysisBlockData['opportunities'],
      threats: threats as SwotAnalysisBlockData['threats'],
    };

    return { block: makeBlock('swot_analysis', data) };
  }

  private renderSummaryCards(input: Record<string, unknown>): ToolExecutionOutput {
    if (typeof input.profiles !== 'string' || typeof input.jira !== 'string') {
      return { content: JSON.stringify({ error: 'render_summary_cards requires profiles and jira strings' }) };
    }

    const data: SummaryCardsBlockData = {
      profiles: input.profiles as string,
      jira: input.jira as string,
      confluence: (input.confluence as string | null) ?? null,
      github: (input.github as string | null) ?? null,
      codebase: (input.codebase as string | null) ?? null,
    };

    return { block: makeBlock('summary_cards', data) };
  }

  private renderQualityMetrics(input: Record<string, unknown>): ToolExecutionOutput {
    if (typeof input.totalItems !== 'number' || typeof input.qualityScore !== 'number') {
      return { content: JSON.stringify({ error: 'render_quality_metrics requires totalItems and qualityScore numbers' }) };
    }

    const data: QualityMetricsBlockData = {
      totalItems: input.totalItems as number,
      multiSourceItems: (input.multiSourceItems as number) ?? 0,
      sourceTypeCoverage: (input.sourceTypeCoverage as Record<string, number>) ?? {},
      confidenceDistribution: (input.confidenceDistribution as { high: number; medium: number; low: number }) ?? { high: 0, medium: 0, low: 0 },
      averageEvidencePerItem: (input.averageEvidencePerItem as number) ?? 0,
      qualityScore: input.qualityScore as number,
      sourceCoverage: input.sourceCoverage as QualityMetricsBlockData['sourceCoverage'],
    };

    return { block: makeBlock('quality_metrics', data) };
  }

  private renderMermaid(input: Record<string, unknown>): ToolExecutionOutput {
    if (typeof input.title !== 'string' || typeof input.source !== 'string') {
      return { content: JSON.stringify({ error: 'render_mermaid requires title and source strings' }) };
    }

    const source = input.source as string;
    if (source.trim().length === 0) {
      return { content: JSON.stringify({ error: 'render_mermaid source cannot be empty' }) };
    }

    const data: MermaidBlockData = {
      title: input.title as string,
      source,
    };

    return { block: makeBlock('mermaid', data) };
  }

  private renderChart(input: Record<string, unknown>): ToolExecutionOutput {
    if (typeof input.title !== 'string' || typeof input.chartType !== 'string' || !input.spec) {
      return { content: JSON.stringify({ error: 'render_chart requires title, chartType, and spec' }) };
    }

    const validTypes = ['bar', 'line', 'pie', 'radar', 'doughnut'];
    if (!validTypes.includes(input.chartType as string)) {
      return { content: JSON.stringify({ error: `render_chart chartType must be one of: ${validTypes.join(', ')}` }) };
    }

    const spec = input.spec as Record<string, unknown>;
    if (typeof spec !== 'object' || spec === null) {
      return { content: JSON.stringify({ error: 'render_chart spec must be an object' }) };
    }

    const specData = spec.data as Record<string, unknown> | undefined;
    if (!specData || typeof specData !== 'object') {
      return { content: JSON.stringify({ error: 'render_chart spec.data is required and must be an object with labels and datasets' }) };
    }

    if (!Array.isArray(specData.labels)) {
      return { content: JSON.stringify({ error: 'render_chart spec.data.labels must be an array' }) };
    }

    if (!Array.isArray(specData.datasets) || specData.datasets.length === 0) {
      return { content: JSON.stringify({ error: 'render_chart spec.data.datasets must be a non-empty array' }) };
    }

    const data: ChartBlockData = {
      title: input.title as string,
      chartType: input.chartType as ChartBlockData['chartType'],
      spec: input.spec,
    };

    return { block: makeBlock('chart', data) };
  }

  private renderDataTable(input: Record<string, unknown>): ToolExecutionOutput {
    if (typeof input.title !== 'string' || !Array.isArray(input.headers) || !Array.isArray(input.rows)) {
      return { content: JSON.stringify({ error: 'render_data_table requires title string, headers array, and rows array' }) };
    }

    const data: DataTableBlockData = {
      title: input.title as string,
      headers: input.headers as string[],
      rows: input.rows as string[][],
    };

    return { block: makeBlock('data_table', data) };
  }

  private async renderComparison(input: Record<string, unknown>): Promise<ToolExecutionOutput> {
    if (typeof input.baseAnalysisId !== 'string' || typeof input.compareAnalysisId !== 'string') {
      return { content: JSON.stringify({ error: 'render_comparison requires baseAnalysisId and compareAnalysisId strings' }) };
    }

    if (!this.comparisonService) {
      return { content: JSON.stringify({ error: 'Comparison service not available' }) };
    }

    const result = await this.comparisonService.compare(
      input.baseAnalysisId as string,
      input.compareAnalysisId as string,
    );

    if (!result.ok) {
      return { content: JSON.stringify({ error: result.error.message }) };
    }

    const data: ComparisonBlockData = {
      baseAnalysisId: input.baseAnalysisId as string,
      compareAnalysisId: input.compareAnalysisId as string,
      diff: result.value,
    };

    return { block: makeBlock('comparison', data) };
  }
}

function makeBlock<T extends ContentBlock['type']>(
  type: T,
  data: Extract<ContentBlock, { type: T }>['data'],
): ContentBlock {
  return { type, id: generateBlockId(), data } as ContentBlock;
}
