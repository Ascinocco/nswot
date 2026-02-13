import { useState, useCallback } from 'react';

interface WriteFilePreviewProps {
  action: ChatAction;
  onApprove: (actionId: string) => void;
  onApproveAndRemember?: (actionId: string) => void;
  onReject: (actionId: string) => void;
  isApproving: boolean;
  isRejecting: boolean;
}

function getFileExtension(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : '';
}

const EXT_COLORS: Record<string, string> = {
  md: 'text-blue-400 bg-blue-900/30',
  csv: 'text-green-400 bg-green-900/30',
  json: 'text-yellow-400 bg-yellow-900/30',
  ts: 'text-blue-300 bg-blue-900/30',
  tsx: 'text-blue-300 bg-blue-900/30',
  js: 'text-yellow-300 bg-yellow-900/30',
  mmd: 'text-purple-400 bg-purple-900/30',
  txt: 'text-gray-400 bg-gray-800/50',
};

export default function WriteFilePreview({
  action,
  onApprove,
  onApproveAndRemember,
  onReject,
  isApproving,
  isRejecting,
}: WriteFilePreviewProps): React.JSX.Element {
  const [showFull, setShowFull] = useState(false);
  const isBusy = isApproving || isRejecting;

  const filePath = String(action.toolInput['path'] ?? '');
  const content = String(action.toolInput['content'] ?? '');
  const ext = getFileExtension(filePath);
  const extColor = EXT_COLORS[ext] ?? 'text-gray-400 bg-gray-800/50';
  const lines = content.split('\n');
  const previewLines = showFull ? lines : lines.slice(0, 15);
  const hasMore = lines.length > 15;

  return (
    <div className="my-2 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold ${extColor}`}>
          {ext.toUpperCase() || 'F'}
        </span>
        <span className="text-xs font-semibold text-amber-200">Write File</span>
        <span className="ml-auto rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-400">
          Pending approval
        </span>
      </div>

      {/* File path */}
      <div className="mb-2 rounded bg-gray-950/50 px-2 py-1">
        <span className="font-mono text-xs text-gray-300">{filePath}</span>
      </div>

      {/* Content preview */}
      <div className="mb-3 rounded border border-gray-800 bg-gray-950/50">
        <pre className="max-h-60 overflow-auto p-2 text-xs leading-relaxed text-gray-300">
          {previewLines.join('\n')}
        </pre>
        {hasMore && !showFull && (
          <button
            onClick={() => setShowFull(true)}
            className="w-full border-t border-gray-800 py-1 text-center text-[10px] text-blue-400 hover:text-blue-300"
          >
            Show all {lines.length} lines
          </button>
        )}
        {showFull && hasMore && (
          <button
            onClick={() => setShowFull(false)}
            className="w-full border-t border-gray-800 py-1 text-center text-[10px] text-blue-400 hover:text-blue-300"
          >
            Collapse
          </button>
        )}
      </div>

      {/* Size info */}
      <div className="mb-3 text-[10px] text-gray-500">
        {lines.length} line{lines.length !== 1 ? 's' : ''} &middot; {content.length} characters
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onApprove(action.id)}
          disabled={isBusy}
          className="rounded bg-green-700 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isApproving ? 'Writing...' : 'Approve'}
        </button>
        {onApproveAndRemember && (
          <button
            onClick={() => onApproveAndRemember(action.id)}
            disabled={isBusy}
            className="rounded bg-green-800 px-3 py-1 text-xs font-medium text-green-200 transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            title="Approve and auto-approve future write_file actions"
          >
            {isApproving ? 'Writing...' : 'Yes + Remember'}
          </button>
        )}
        <button
          onClick={() => onReject(action.id)}
          disabled={isBusy}
          className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRejecting ? 'Rejecting...' : 'Reject'}
        </button>
      </div>
    </div>
  );
}
