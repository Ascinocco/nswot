import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAnalysis, useDeleteAnalysis } from '../hooks/use-analysis';
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
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AnalysisDetailPage(): React.JSX.Element {
  const { analysisId } = useParams<{ analysisId: string }>();
  const navigate = useNavigate();
  const { data: analysis, isLoading } = useAnalysis(analysisId ?? null);
  const deleteAnalysis = useDeleteAnalysis();
  const exportMarkdown = useExportMarkdown();

  const [showChat, setShowChat] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const handleExport = useCallback(async () => {
    if (!analysisId) return;
    try {
      const markdown = await exportMarkdown.mutateAsync(analysisId);
      await navigator.clipboard.writeText(markdown);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 2000);
    } catch {
      // Error shown via mutation state
    }
  }, [analysisId, exportMarkdown]);

  const handleDelete = useCallback(async () => {
    if (!analysisId) return;
    if (!confirm('Delete this analysis?')) return;
    await deleteAnalysis.mutateAsync(analysisId);
    navigate('/history');
  }, [analysisId, deleteAnalysis, navigate]);

  if (!analysisId) {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold">Analysis Detail</h2>
        <p className="text-gray-400">No analysis selected.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/history')}
            className="rounded px-2 py-1 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            Back
          </button>
          <h2 className="text-2xl font-bold">Analysis Detail</h2>
        </div>
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/history')}
            className="rounded px-2 py-1 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            Back
          </button>
          <h2 className="text-2xl font-bold">Analysis Detail</h2>
        </div>
        <p className="text-gray-400">Analysis not found.</p>
      </div>
    );
  }

  const config = analysis.config;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/history')}
            className="rounded px-2 py-1 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            Back
          </button>
          <h2 className="text-2xl font-bold">Analysis Detail</h2>
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[analysis.status] ?? STATUS_STYLES['pending']}`}
          >
            {analysis.status}
          </span>
          <span className="text-sm text-gray-400">
            {ROLE_LABELS[analysis.role] ?? analysis.role}
          </span>
          <span className="text-sm text-gray-600">·</span>
          <span className="text-sm text-gray-500">{analysis.modelId}</span>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          Created {formatDate(analysis.createdAt)}
          {analysis.completedAt && ` · Completed ${formatDate(analysis.completedAt)}`}
        </div>

        {/* Config summary */}
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
          <span>{config.profileIds.length} profile{config.profileIds.length !== 1 ? 's' : ''}</span>
          {config.jiraProjectKeys.length > 0 && (
            <span>· {config.jiraProjectKeys.length} Jira project{config.jiraProjectKeys.length !== 1 ? 's' : ''}</span>
          )}
          {config.confluenceSpaceKeys?.length > 0 && (
            <span>· {config.confluenceSpaceKeys.length} Confluence space{config.confluenceSpaceKeys.length !== 1 ? 's' : ''}</span>
          )}
          {config.githubRepos?.length > 0 && (
            <span>· {config.githubRepos.length} GitHub repo{config.githubRepos.length !== 1 ? 's' : ''}</span>
          )}
          {config.codebaseRepos?.length > 0 && (
            <span>· {config.codebaseRepos.length} codebase repo{config.codebaseRepos.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {analysis.error && (
          <p className="mt-3 text-sm text-red-400">{analysis.error}</p>
        )}
        {analysis.warning && (
          <p className="mt-3 text-sm text-yellow-400">{analysis.warning}</p>
        )}
      </div>

      {/* Action bar */}
      {analysis.status === 'completed' && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowChat(!showChat)}
            className="rounded-lg border border-green-700 px-4 py-2 text-sm text-green-300 transition-colors hover:border-green-600 hover:text-green-200"
          >
            {showChat ? 'Hide Chat' : 'Chat'}
          </button>
          <button
            onClick={handleExport}
            disabled={exportMarkdown.isPending}
            className="rounded-lg border border-purple-700 px-4 py-2 text-sm text-purple-300 transition-colors hover:border-purple-600 hover:text-purple-200 disabled:opacity-50"
          >
            {exportSuccess ? 'Copied!' : 'Export'}
          </button>
          <button
            onClick={() => navigate(`/themes/${analysisId}`)}
            className="rounded-lg border border-teal-700 px-4 py-2 text-sm text-teal-300 transition-colors hover:border-teal-600 hover:text-teal-200"
          >
            Themes
          </button>
          <button
            onClick={() => navigate('/comparison')}
            className="rounded-lg border border-cyan-700 px-4 py-2 text-sm text-cyan-300 transition-colors hover:border-cyan-600 hover:text-cyan-200"
          >
            Compare
          </button>
          <button
            onClick={handleDelete}
            className="rounded-lg border border-red-700 px-4 py-2 text-sm text-red-300 transition-colors hover:border-red-600 hover:text-red-200"
          >
            Delete
          </button>
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
      {showChat && (
        <ChatPanel
          analysisId={analysisId}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* SWOT Results */}
      {analysis.swotOutput && (
        <SwotResults analysis={analysis} />
      )}
    </div>
  );
}
