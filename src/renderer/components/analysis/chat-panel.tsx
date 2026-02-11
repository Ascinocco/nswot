import { useState, useEffect, useRef, useCallback } from 'react';
import Markdown from 'react-markdown';
import { useQueryClient } from '@tanstack/react-query';
import { useChatMessages, useSendMessage, useDeleteChat, useChatActions, useApproveAction, useRejectAction, useEditAction } from '../../hooks/use-chat';
import ApprovalCard from './approval-card';
import ActionStatus from './action-status';

interface ChatPanelProps {
  analysisId: string;
  onClose: () => void;
}

export default function ChatPanel({ analysisId, onClose }: ChatPanelProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const { data: messages, isLoading } = useChatMessages(analysisId);
  const sendMessage = useSendMessage(analysisId);
  const deleteChat = useDeleteChat(analysisId);
  const { data: actions } = useChatActions(analysisId);
  const approveAction = useApproveAction(analysisId);
  const rejectAction = useRejectAction(analysisId);
  const editAction = useEditAction(analysisId);
  const [input, setInput] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isSending = sendMessage.isPending;

  // Listen for new pending actions
  useEffect(() => {
    const cleanup = window.nswot.chat.actions.onPending((action) => {
      if (action.analysisId === analysisId) {
        queryClient.invalidateQueries({ queryKey: ['chat-actions', analysisId] });
      }
    });
    return cleanup;
  }, [analysisId, queryClient]);

  // Listen for streaming chunks
  useEffect(() => {
    const cleanup = window.nswot.chat.onChunk((data) => {
      if (data.analysisId === analysisId) {
        setStreamingContent((prev) => prev + data.chunk);
      }
    });
    return cleanup;
  }, [analysisId]);

  // Clear streaming content when send completes
  useEffect(() => {
    if (!isSending && streamingContent) {
      setStreamingContent('');
    }
  }, [isSending]);

  // Scroll to bottom on new messages or actions
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, actions]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || isSending) return;

    setInput('');
    setStreamingContent('');
    await sendMessage.mutateAsync(content);
  }, [input, isSending, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleClear = useCallback(() => {
    if (confirm('Clear all chat messages for this analysis?')) {
      deleteChat.mutate();
    }
  }, [deleteChat]);

  return (
    <div className="flex h-[600px] flex-col rounded-lg border border-gray-800 bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h4 className="text-sm font-bold text-gray-200">Chat</h4>
        <div className="flex items-center gap-2">
          {messages && messages.length > 0 && (
            <button
              onClick={handleClear}
              disabled={isSending}
              className="text-xs text-gray-500 hover:text-red-400 disabled:opacity-50"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Close
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && <p className="text-sm text-gray-500">Loading messages...</p>}

        {messages && messages.length === 0 && !isSending && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-gray-400">Ask questions about this analysis.</p>
              <p className="mt-1 text-xs text-gray-600">
                The assistant has full context of the SWOT results and evidence.
              </p>
            </div>
          </div>
        )}

        {messages && messages.length > 0 && (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id}>
                <MessageBubble role={msg.role} content={msg.content} />
                {/* Render actions associated with this message */}
                {actions
                  ?.filter((a) => a.chatMessageId === msg.id)
                  .map((action) =>
                    action.status === 'pending' ? (
                      <ApprovalCard
                        key={action.id}
                        action={action}
                        onApprove={(id) => approveAction.mutate(id)}
                        onReject={(id) => rejectAction.mutate(id)}
                        onEdit={(id, editedInput) => editAction.mutate({ actionId: id, editedInput })}
                        isApproving={approveAction.isPending}
                        isRejecting={rejectAction.isPending}
                        isEditing={editAction.isPending}
                      />
                    ) : (
                      <ActionStatus key={action.id} action={action} />
                    ),
                  )}
              </div>
            ))}
            {/* Render orphaned actions (no chatMessageId) */}
            {actions
              ?.filter((a) => !a.chatMessageId)
              .map((action) =>
                action.status === 'pending' ? (
                  <ApprovalCard
                    key={action.id}
                    action={action}
                    onApprove={(id) => approveAction.mutate(id)}
                    onReject={(id) => rejectAction.mutate(id)}
                    onEdit={(id, editedInput) => editAction.mutate({ actionId: id, editedInput })}
                    isApproving={approveAction.isPending}
                    isRejecting={rejectAction.isPending}
                    isEditing={editAction.isPending}
                  />
                ) : (
                  <ActionStatus key={action.id} action={action} />
                ),
              )}
          </div>
        )}

        {/* Streaming response */}
        {isSending && streamingContent && (
          <div className="mt-4">
            <MessageBubble role="assistant" content={streamingContent} isStreaming />
          </div>
        )}

        {/* Sending indicator when no content has streamed yet */}
        {isSending && !streamingContent && (
          <div className="mt-4 flex items-center gap-2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            <span className="text-xs text-gray-500">Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 p-3">
        {sendMessage.isError && (
          <p className="mb-2 text-xs text-red-400">
            {sendMessage.error instanceof Error ? sendMessage.error.message : 'Failed to send message'}
          </p>
        )}
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the analysis..."
            disabled={isSending}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="self-end rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-600">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
  isStreaming,
}: {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}): React.JSX.Element {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-blue-900/40 text-blue-100'
            : 'bg-gray-800 text-gray-200'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none prose-headings:text-gray-200 prose-strong:text-gray-200 prose-li:text-gray-200 prose-p:text-gray-200 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-p:my-1">
            <Markdown>{content}</Markdown>
          </div>
        )}
        {isStreaming && (
          <span className="inline-block h-3 w-1 animate-pulse bg-blue-400" />
        )}
      </div>
    </div>
  );
}
