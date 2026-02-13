import type {
  SwotAnalysisBlockData,
  SummaryCardsBlockData,
  QualityMetricsBlockData,
  MermaidBlockData,
  ChartBlockData,
  DataTableBlockData,
  ComparisonBlockData,
  ApprovalBlockData,
  ActionStatusBlockData,
} from '../../../main/domain/content-block.types';
import ThinkingBlock from './blocks/thinking-block';
import SwotBlock from './blocks/swot-block';
import SummaryBlock from './blocks/summary-block';
import MetricsBlock from './blocks/metrics-block';
import MermaidBlock from './blocks/mermaid-block';
import ChartBlock from './blocks/chart-block';
import DataTableBlock from './blocks/data-table-block';
import ComparisonBlock from './blocks/comparison-block';
import ApprovalBlock from './blocks/approval-block';
import ActionStatusBlock from './blocks/action-status-block';

/**
 * ContentBlockRenderer: dispatches a ContentBlock to the appropriate component.
 */

interface ContentBlockRendererProps {
  block: {
    type: string;
    id: string;
    data: unknown;
  };
  conversationId?: string | null;
}

export default function ContentBlockRenderer({
  block,
  conversationId,
}: ContentBlockRendererProps): React.JSX.Element {
  switch (block.type) {
    case 'text':
      return <TextBlock text={(block.data as { text: string }).text} />;

    case 'thinking':
      return <ThinkingBlock thinking={(block.data as { thinking: string }).thinking} />;

    case 'swot_analysis':
      return <SwotBlock data={block.data as SwotAnalysisBlockData} />;

    case 'summary_cards':
      return <SummaryBlock data={block.data as SummaryCardsBlockData} />;

    case 'quality_metrics':
      return <MetricsBlock data={block.data as QualityMetricsBlockData} />;

    case 'mermaid':
      return <MermaidBlock data={block.data as MermaidBlockData} />;

    case 'chart':
      return <ChartBlock data={block.data as ChartBlockData} />;

    case 'data_table':
      return <DataTableBlock data={block.data as DataTableBlockData} />;

    case 'comparison':
      return <ComparisonBlock data={block.data as ComparisonBlockData} />;

    case 'approval':
      return (
        <ApprovalBlock
          data={block.data as ApprovalBlockData}
          conversationId={conversationId ?? null}
        />
      );

    case 'action_status':
      return <ActionStatusBlock data={block.data as ActionStatusBlockData} />;

    default:
      return (
        <div className="my-2 text-xs text-gray-500">
          Unknown block type: {block.type}
        </div>
      );
  }
}

function TextBlock({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      {text.split('\n').map((line, i) => (
        <p key={i} className="my-1 text-sm text-gray-200">
          {line || '\u00A0'}
        </p>
      ))}
    </div>
  );
}
