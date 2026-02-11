interface PayloadPreviewProps {
  data: { systemPrompt: string; userPrompt: string; tokenEstimate: number } | null;
  isLoading: boolean;
  onClose: () => void;
}

export default function PayloadPreview({
  data,
  isLoading,
  onClose,
}: PayloadPreviewProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-bold text-gray-200">Payload Preview</h4>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-gray-500">
              ~{data.tokenEstimate.toLocaleString()} tokens
            </span>
          )}
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Close
          </button>
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-gray-500">Building preview...</p>
      )}

      {data && (
        <div className="space-y-4">
          <div>
            <h5 className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-500">
              System Prompt
            </h5>
            <pre className="max-h-48 overflow-auto rounded bg-gray-950 p-3 text-xs text-gray-400">
              {data.systemPrompt}
            </pre>
          </div>
          <div>
            <h5 className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-500">
              User Prompt
            </h5>
            <pre className="max-h-96 overflow-auto rounded bg-gray-950 p-3 text-xs text-gray-400">
              {data.userPrompt}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
