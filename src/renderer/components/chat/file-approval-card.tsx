import { useState, useCallback } from 'react';
import MermaidRenderer from '../visualizations/mermaid-renderer';

interface FileApprovalCardProps {
  action: ChatAction;
  onApprove: (actionId: string) => void;
  onReject: (actionId: string) => void;
  onEdit: (actionId: string, editedInput: Record<string, unknown>) => void;
  isApproving: boolean;
  isRejecting: boolean;
  isEditing: boolean;
}

const FILE_TOOL_LABELS: Record<string, string> = {
  write_markdown_file: 'Write Markdown File',
  write_csv_file: 'Write CSV File',
  write_mermaid_file: 'Write Mermaid Diagram',
};

const FILE_TOOL_ICONS: Record<string, string> = {
  write_markdown_file: 'MD',
  write_csv_file: 'CSV',
  write_mermaid_file: 'MMD',
};

const FORMAT_COLORS: Record<string, string> = {
  write_markdown_file: 'text-blue-400',
  write_csv_file: 'text-green-400',
  write_mermaid_file: 'text-purple-400',
};

function isMermaidTool(toolName: string): boolean {
  return toolName === 'write_mermaid_file';
}

export default function FileApprovalCard({
  action,
  onApprove,
  onReject,
  onEdit,
  isApproving,
  isRejecting,
  isEditing: isSavingEdit,
}: FileApprovalCardProps): React.JSX.Element {
  const [editMode, setEditMode] = useState(false);
  const [editedInput, setEditedInput] = useState<Record<string, unknown>>(action.toolInput);
  const [showMermaidPreview, setShowMermaidPreview] = useState(true);
  const isBusy = isApproving || isRejecting || isSavingEdit;

  const label = FILE_TOOL_LABELS[action.toolName] ?? action.toolName;
  const icon = FILE_TOOL_ICONS[action.toolName] ?? 'F';
  const colorClass = FORMAT_COLORS[action.toolName] ?? 'text-gray-400';

  const filePath = String(action.toolInput['path'] ?? '');
  const content = String(action.toolInput['content'] ?? '');

  const editedPath = String(editedInput['path'] ?? '');
  const editedContent = String(editedInput['content'] ?? '');

  const handleStartEdit = useCallback(() => {
    setEditedInput({ ...action.toolInput });
    setEditMode(true);
  }, [action.toolInput]);

  const handleCancelEdit = useCallback(() => {
    setEditMode(false);
    setEditedInput(action.toolInput);
  }, [action.toolInput]);

  const handleSaveEdit = useCallback(() => {
    onEdit(action.id, editedInput);
    setEditMode(false);
  }, [action.id, editedInput, onEdit]);

  return (
    <div className="my-2 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded bg-gray-800 text-[10px] font-bold ${colorClass}`}>
          {icon}
        </span>
        <span className="text-xs font-semibold text-amber-200">{label}</span>
        <span className="ml-auto rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-400">
          {editMode ? 'Editing' : 'Pending approval'}
        </span>
      </div>

      {/* File path */}
      <div className="mb-2 flex items-center gap-1 text-xs">
        <span className="font-medium text-gray-400">File:</span>
        {editMode ? (
          <input
            type="text"
            value={editedPath}
            onChange={(e) => setEditedInput({ ...editedInput, path: e.target.value })}
            className="flex-1 rounded border border-gray-700 bg-gray-950 px-2 py-0.5 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
          />
        ) : (
          <span className="text-gray-300">{filePath}</span>
        )}
      </div>

      {/* Content preview / editor */}
      <div className="mb-3 rounded border border-gray-800 bg-gray-950/50">
        {editMode ? (
          <textarea
            value={editedContent}
            onChange={(e) => setEditedInput({ ...editedInput, content: e.target.value })}
            rows={10}
            className="w-full resize-y rounded bg-gray-950 p-2 font-mono text-xs text-gray-200 focus:outline-none"
          />
        ) : (
          <>
            {/* For mermaid files, show visual preview with source toggle */}
            {isMermaidTool(action.toolName) && (
              <div className="flex border-b border-gray-800">
                <button
                  onClick={() => setShowMermaidPreview(true)}
                  className={`px-3 py-1 text-xs transition-colors ${
                    showMermaidPreview ? 'border-b border-blue-400 text-blue-400' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Preview
                </button>
                <button
                  onClick={() => setShowMermaidPreview(false)}
                  className={`px-3 py-1 text-xs transition-colors ${
                    !showMermaidPreview ? 'border-b border-blue-400 text-blue-400' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Source
                </button>
              </div>
            )}
            <div className="p-2">
              {isMermaidTool(action.toolName) && showMermaidPreview ? (
                <MermaidRenderer content={content} className="min-h-[100px]" />
              ) : (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-gray-300">
                  {content.split('\n').slice(0, 20).join('\n')}
                  {content.split('\n').length > 20 ? '\n...' : ''}
                </pre>
              )}
            </div>
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {editMode ? (
          <>
            <button
              onClick={handleSaveEdit}
              disabled={isBusy}
              className="rounded bg-blue-700 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingEdit ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={isBusy}
              className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onApprove(action.id)}
              disabled={isBusy}
              className="rounded bg-green-700 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isApproving ? 'Creating...' : 'Approve'}
            </button>
            <button
              onClick={handleStartEdit}
              disabled={isBusy}
              className="rounded bg-blue-800 px-3 py-1 text-xs font-medium text-blue-200 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Edit
            </button>
            <button
              onClick={() => onReject(action.id)}
              disabled={isBusy}
              className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRejecting ? 'Rejecting...' : 'Reject'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
