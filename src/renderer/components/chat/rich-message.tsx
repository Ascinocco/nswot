import ContentBlockRenderer from './content-block-renderer';
import ThinkingBlock from './blocks/thinking-block';
import ToolProgress from './tool-progress';
import type { ToolActivity, ContentBlock } from '../../hooks/use-agent';

interface RichMessageProps {
  role: 'user' | 'assistant';
  /** Plain text content (for text-format messages) */
  text?: string;
  /** Content blocks (for blocks-format messages) */
  blocks?: ContentBlock[];
  /** Currently streaming text (appended after blocks) */
  streamingText?: string;
  /** Currently streaming thinking text */
  streamingThinking?: string;
  /** Currently active tool */
  toolActivity?: ToolActivity;
  /** Conversation ID for approval memory */
  conversationId?: string | null;
}

export default function RichMessage({
  role,
  text,
  blocks,
  streamingText,
  streamingThinking,
  toolActivity,
  conversationId,
}: RichMessageProps): React.JSX.Element {
  const isUser = role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-900/50 text-xs font-medium text-blue-300">
          AI
        </div>
      )}

      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-blue-900/30 text-gray-200'
            : 'bg-gray-800/50 text-gray-200'
        }`}
      >
        {/* Plain text content */}
        {text && !blocks && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{text}</div>
        )}

        {/* Streaming thinking (before blocks) */}
        {streamingThinking && (
          <ThinkingBlock thinking={streamingThinking} isStreaming />
        )}

        {/* Rich content blocks */}
        {blocks && blocks.map((block) => (
          <ContentBlockRenderer key={block.id} block={block} conversationId={conversationId} />
        ))}

        {/* Active tool progress indicator */}
        {toolActivity && (
          <ToolProgress activity={toolActivity} />
        )}

        {/* Streaming text */}
        {streamingText && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {streamingText}
            <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-blue-400" />
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-medium text-gray-300">
          You
        </div>
      )}
    </div>
  );
}
