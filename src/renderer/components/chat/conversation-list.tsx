import { useState, useCallback, useRef, useEffect } from 'react';

interface ConversationListProps {
  conversations: Conversation[];
  isLoading: boolean;
  onSelect: (conversationId: string) => void;
  onNew: () => void;
  onDelete: (conversationId: string) => void;
  onRename: (conversationId: string, title: string) => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ConversationList({
  conversations,
  isLoading,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: ConversationListProps): React.JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleStartEdit = useCallback((e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditValue(conv.title ?? '');
  }, []);

  const handleFinishEdit = useCallback(() => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue('');
  }, [editingId, editValue, onRename]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFinishEdit();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditValue('');
    }
  }, [handleFinishEdit]);

  const handleRequestDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
  }, []);

  const handleConfirmDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingId) {
      onDelete(deletingId);
      setDeletingId(null);
    }
  }, [deletingId, onDelete]);

  const handleCancelDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(null);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Chat Analysis</h2>
        <button
          onClick={onNew}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          New Analysis
        </button>
      </div>

      {conversations.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-gray-400">No conversations yet.</p>
          <p className="mt-1 text-sm text-gray-500">
            Click "New Analysis" to start your first analysis conversation.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 p-4 text-left transition-colors hover:border-gray-700 hover:bg-gray-800/70"
            >
              <div className="min-w-0 flex-1">
                {editingId === conv.id ? (
                  <input
                    ref={editInputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    onBlur={handleFinishEdit}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded border border-blue-600 bg-gray-800 px-2 py-1 text-sm font-medium text-white focus:outline-none"
                  />
                ) : (
                  <h3 className="truncate font-medium text-white">
                    {conv.title ?? 'Untitled Analysis'}
                  </h3>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  {formatDate(conv.createdAt)}
                </p>
              </div>
              <div className="ml-4 flex shrink-0 items-center gap-1">
                {deletingId === conv.id ? (
                  <>
                    <span className="mr-1 text-[10px] text-red-400">Delete?</span>
                    <button
                      onClick={handleConfirmDelete}
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-950/50 transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={handleCancelDelete}
                      className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-700 transition-colors"
                    >
                      No
                    </button>
                  </>
                ) : (
                  <>
                    {/* Rename button */}
                    <button
                      onClick={(e) => handleStartEdit(e, conv)}
                      className="rounded p-1 text-gray-600 hover:bg-gray-700 hover:text-gray-300 transition-colors"
                      title="Rename conversation"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={(e) => handleRequestDelete(e, conv.id)}
                      className="rounded p-1 text-gray-600 hover:bg-gray-700 hover:text-red-400 transition-colors"
                      title="Delete conversation"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
