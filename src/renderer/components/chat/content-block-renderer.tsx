import { Component } from 'react';
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ContentBlock } from '../../hooks/use-agent';
import { isBlockType } from '../../../main/domain/content-block.types';
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
 * Wraps each block in an error boundary so malformed data shows a fallback
 * instead of crashing the entire chat.
 */

interface ContentBlockRendererProps {
  block: ContentBlock;
  conversationId?: string | null;
}

export default function ContentBlockRenderer({
  block,
  conversationId,
}: ContentBlockRendererProps): React.JSX.Element {
  return (
    <BlockErrorBoundary blockType={block.type} blockId={block.id}>
      <BlockDispatch block={block} conversationId={conversationId} />
    </BlockErrorBoundary>
  );
}

function BlockDispatch({
  block,
  conversationId,
}: ContentBlockRendererProps): React.JSX.Element {
  if (isBlockType(block, 'text')) {
    return <TextBlock text={block.data.text} />;
  }
  if (isBlockType(block, 'thinking')) {
    return <ThinkingBlock thinking={block.data.thinking} />;
  }
  if (isBlockType(block, 'swot_analysis')) {
    return <SwotBlock data={block.data} />;
  }
  if (isBlockType(block, 'summary_cards')) {
    return <SummaryBlock data={block.data} />;
  }
  if (isBlockType(block, 'quality_metrics')) {
    return <MetricsBlock data={block.data} />;
  }
  if (isBlockType(block, 'mermaid')) {
    return <MermaidBlock data={block.data} />;
  }
  if (isBlockType(block, 'chart')) {
    return <ChartBlock data={block.data} />;
  }
  if (isBlockType(block, 'data_table')) {
    return <DataTableBlock data={block.data} />;
  }
  if (isBlockType(block, 'comparison')) {
    return <ComparisonBlock data={block.data} />;
  }
  if (isBlockType(block, 'approval')) {
    return (
      <ApprovalBlock
        data={block.data}
        conversationId={conversationId ?? null}
      />
    );
  }
  if (isBlockType(block, 'action_status')) {
    return <ActionStatusBlock data={block.data} />;
  }

  return (
    <div className="my-2 text-xs text-gray-500">
      Unknown block type: {(block as { type: string }).type}
    </div>
  );
}

function TextBlock({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="prose prose-invert prose-sm max-w-none text-gray-200 prose-headings:text-gray-100 prose-strong:text-gray-100 prose-code:text-blue-300 prose-a:text-blue-400 prose-th:text-gray-300 prose-td:text-gray-300 prose-thead:border-gray-700 prose-tr:border-gray-800">
      <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
    </div>
  );
}

/** Error boundary that catches render errors in individual blocks. */
interface BlockErrorBoundaryProps {
  blockType: string;
  blockId: string;
  children: ReactNode;
}
interface BlockErrorBoundaryState {
  error: Error | null;
}

class BlockErrorBoundary extends Component<BlockErrorBoundaryProps, BlockErrorBoundaryState> {
  state: BlockErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BlockErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error(
      `[ContentBlockRenderer] Error rendering block type="${this.props.blockType}" id="${this.props.blockId}":`,
      error,
    );
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="my-2 rounded border border-red-800/50 bg-red-950/20 px-3 py-2 text-xs text-red-400">
          Unable to render {this.props.blockType} block
        </div>
      );
    }
    return this.props.children;
  }
}
