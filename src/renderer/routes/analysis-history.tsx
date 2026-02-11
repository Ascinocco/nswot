import { useState, useCallback } from 'react';
import { useCurrentWorkspace } from '../hooks/use-workspace';
import { useAnalyses, useAnalysis, useDeleteAnalysis } from '../hooks/use-analysis';
import { useExportMarkdown } from '../hooks/use-export';
import SwotResults from '../components/analysis/swot-results';
import ChatPanel from '../components/analysis/chat-panel';

const ROLE_LABELS: Record<string, string> = {
  staff_engineer: 'Staff Engineer',
  senior_em: 'Senior EM',
};

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-900/50 text-green-300',
  failed: 'bg-red-900/50 text-red-300',
  running: 'bg-blue-900/50 text-blue-300',
  pending: 'bg-gray-800 text-gray-400',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AnalysisHistoryPage(): React.JSX.Element {
  const { data: workspace } = useCurrentWorkspace();
  const { data: analyses, isLoading } = useAnalyses(!!workspace);
  const deleteAnalysis = useDeleteAnalysis();
  const exportMarkdown = useExportMarkdown();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const { data: selectedAnalysis } = useAnalysis(selectedId);

  const handleExport = useCallback(
    async (analysisId: string) => {
      try {
        const markdown = await exportMarkdown.mutateAsync(analysisId);
        await navigator.clipboard.writeText(markdown);
        setExportSuccess(analysisId);
        setTimeout(() => setExportSuccess(null), 2000);
      } catch {
        // Error shown via mutation state
      }
    },
    [exportMarkdown],
  );

  if (!workspace) {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold">Analysis History</h2>
        <p className="text-gray-400">Open a workspace to view analysis history.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Analysis History</h2>

      {isLoading && <p className="text-gray-500">Loading...</p>}

      {analyses && analyses.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-700 p-8 text-center">
          <p className="text-gray-400">No analyses yet.</p>
          <p className="mt-1 text-sm text-gray-500">
            Run your first analysis from the Analysis page.
          </p>
        </div>
      )}

      {analyses && analyses.length > 0 && (
        <div className="space-y-3">
          {analyses.map((analysis) => {
            const isSelected = selectedId === analysis.id;
            const isCompleted = analysis.status === 'completed';

            return (
              <div
                key={analysis.id}
                className={`rounded-lg border bg-gray-900 p-4 transition-colors ${
                  isSelected ? 'border-blue-700' : 'border-gray-800'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[analysis.status] ?? STATUS_STYLES['pending']}`}
                      >
                        {analysis.status}
                      </span>
                      <span className="text-sm text-gray-400">
                        {ROLE_LABELS[analysis.role] ?? analysis.role}
                      </span>
                      <span className="text-sm text-gray-600">·</span>
                      <span className="text-sm text-gray-500">{analysis.modelId}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Created {formatDate(analysis.createdAt)}
                      {analysis.completedAt && ` · Completed ${formatDate(analysis.completedAt)}`}
                    </p>
                    {analysis.config.profileIds.length > 0 && (
                      <p className="mt-1 text-xs text-gray-500">
                        {analysis.config.profileIds.length} profile{analysis.config.profileIds.length !== 1 ? 's' : ''}
                        {analysis.config.jiraProjectKeys.length > 0 &&
                          ` · ${analysis.config.jiraProjectKeys.length} Jira project${analysis.config.jiraProjectKeys.length !== 1 ? 's' : ''}`}
                      </p>
                    )}
                    {analysis.error && (
                      <p className="mt-2 text-sm text-red-400">{analysis.error}</p>
                    )}
                    {analysis.warning && (
                      <p className="mt-2 text-sm text-yellow-400">{analysis.warning}</p>
                    )}
                    {analysis.swotOutput && (
                      <div className="mt-2 flex gap-4 text-xs text-gray-500">
                        <span>{analysis.swotOutput.strengths.length} strengths</span>
                        <span>{analysis.swotOutput.weaknesses.length} weaknesses</span>
                        <span>{analysis.swotOutput.opportunities.length} opportunities</span>
                        <span>{analysis.swotOutput.threats.length} threats</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {isCompleted && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedId(isSelected ? null : analysis.id);
                            setShowChat(false);
                          }}
                          className="rounded px-2 py-1 text-xs text-blue-400 transition-colors hover:bg-blue-900/30 hover:text-blue-300"
                        >
                          {isSelected ? 'Hide' : 'View'}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedId(analysis.id);
                            setShowChat(true);
                          }}
                          className="rounded px-2 py-1 text-xs text-green-400 transition-colors hover:bg-green-900/30 hover:text-green-300"
                        >
                          Chat
                        </button>
                        <button
                          onClick={() => handleExport(analysis.id)}
                          disabled={exportMarkdown.isPending}
                          className="rounded px-2 py-1 text-xs text-purple-400 transition-colors hover:bg-purple-900/30 hover:text-purple-300 disabled:opacity-50"
                        >
                          {exportSuccess === analysis.id ? 'Copied!' : 'Export'}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        if (confirm('Delete this analysis?')) {
                          if (selectedId === analysis.id) {
                            setSelectedId(null);
                            setShowChat(false);
                          }
                          deleteAnalysis.mutate(analysis.id);
                        }
                      }}
                      className="rounded px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-900/30 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Export error */}
      {exportMarkdown.isError && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-3">
          <p className="text-sm text-red-300">
            {exportMarkdown.error instanceof Error ? exportMarkdown.error.message : 'Export failed'}
          </p>
        </div>
      )}

      {/* Chat Panel */}
      {showChat && selectedId && (
        <ChatPanel
          analysisId={selectedId}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* SWOT Results Detail */}
      {selectedId && selectedAnalysis?.swotOutput && !showChat && (
        <SwotResults analysis={selectedAnalysis} />
      )}
    </div>
  );
}
