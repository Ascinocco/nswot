import type { SwotOutput, SummariesOutput, EvidenceQualityMetrics, ChatAction } from './types';

/**
 * Discriminated union of all content block types rendered in the chat UI.
 *
 * Phase 4 replaces plain-string chat messages with arrays of ContentBlock[].
 * Each block has a `type` discriminator, a stable `id` for React keys, and
 * a typed `data` payload. The renderer dispatches on `type` to select the
 * appropriate component.
 *
 * Frozen at Gate 1 — no changes to the type union or data shapes in later sprints.
 */

export type ContentBlockType =
  | 'text'
  | 'thinking'
  | 'swot_analysis'
  | 'summary_cards'
  | 'quality_metrics'
  | 'mermaid'
  | 'chart'
  | 'data_table'
  | 'comparison'
  | 'approval'
  | 'action_status';

// --- Per-block data shapes ---

export interface TextBlockData {
  text: string;
}

export interface ThinkingBlockData {
  thinking: string;
}

export interface SwotAnalysisBlockData extends SwotOutput {}

export interface SummaryCardsBlockData extends SummariesOutput {}

export interface QualityMetricsBlockData extends EvidenceQualityMetrics {}

export interface MermaidBlockData {
  title: string;
  source: string;
}

export type ChartType = 'bar' | 'line' | 'pie' | 'radar' | 'doughnut';

export interface ChartBlockData {
  title: string;
  chartType: ChartType;
  spec: unknown;
}

export interface DataTableBlockData {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface ComparisonBlockData {
  baseAnalysisId: string;
  compareAnalysisId: string;
  diff: unknown;
}

export interface ApprovalBlockData extends ChatAction {}

export interface ActionStatusBlockData extends ChatAction {}

// --- Data map: block type → data shape ---

export interface ContentBlockDataMap {
  text: TextBlockData;
  thinking: ThinkingBlockData;
  swot_analysis: SwotAnalysisBlockData;
  summary_cards: SummaryCardsBlockData;
  quality_metrics: QualityMetricsBlockData;
  mermaid: MermaidBlockData;
  chart: ChartBlockData;
  data_table: DataTableBlockData;
  comparison: ComparisonBlockData;
  approval: ApprovalBlockData;
  action_status: ActionStatusBlockData;
}

// --- ContentBlock: typed discriminated union ---

export interface ContentBlockBase<T extends ContentBlockType> {
  type: T;
  id: string;
  data: ContentBlockDataMap[T];
}

export type ContentBlock =
  | ContentBlockBase<'text'>
  | ContentBlockBase<'thinking'>
  | ContentBlockBase<'swot_analysis'>
  | ContentBlockBase<'summary_cards'>
  | ContentBlockBase<'quality_metrics'>
  | ContentBlockBase<'mermaid'>
  | ContentBlockBase<'chart'>
  | ContentBlockBase<'data_table'>
  | ContentBlockBase<'comparison'>
  | ContentBlockBase<'approval'>
  | ContentBlockBase<'action_status'>;

// --- Content format for chat messages ---

export type ContentFormat = 'text' | 'blocks';

// --- Type guards ---

export function isBlockType<T extends ContentBlockType>(
  block: ContentBlock,
  type: T,
): block is ContentBlock & ContentBlockBase<T> {
  return block.type === type;
}

// --- All block types as a runtime array (useful for validation) ---

export const CONTENT_BLOCK_TYPES: ContentBlockType[] = [
  'text',
  'thinking',
  'swot_analysis',
  'summary_cards',
  'quality_metrics',
  'mermaid',
  'chart',
  'data_table',
  'comparison',
  'approval',
  'action_status',
];
