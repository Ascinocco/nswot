import { useState, useEffect, useCallback, useRef } from 'react';
import { useCurrentWorkspace } from '../hooks/use-workspace';
import { useProfiles } from '../hooks/use-profiles';
import { useRunAnalysis, usePayloadPreview } from '../hooks/use-analysis';
import { usePreferences, useModels, useApiKeyStatus } from '../hooks/use-settings';
import { useIntegration, useConfluenceIntegration, useGitHubIntegration } from '../hooks/use-integrations';
import { useNavigate } from 'react-router-dom';
import { useExportMarkdown } from '../hooks/use-export';
import SwotResults from '../components/analysis/swot-results';
import PayloadPreview from '../components/analysis/payload-preview';
import ChatPanel from '../components/analysis/chat-panel';

const ROLES = [
  { value: 'staff_engineer', label: 'Staff Engineer' },
  { value: 'senior_em', label: 'Senior Engineering Manager' },
] as const;

const PIPELINE_STEPS = [
  { key: 'collecting', label: 'Load data' },
  { key: 'anonymizing', label: 'Anonymize' },
  { key: 'building_prompt', label: 'Build prompt' },
  { key: 'sending', label: 'LLM generating' },
  { key: 'parsing', label: 'Parse response' },
  { key: 'validating', label: 'Validate evidence' },
  { key: 'storing', label: 'Store results' },
] as const;

const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  PIPELINE_STEPS.map((s, i) => [s.key, i]),
);

export default function AnalysisPage(): React.JSX.Element {
  const activeAnalysisRef = useRef<string | null>(null);
  const { data: workspace } = useCurrentWorkspace();
  const { data: profiles } = useProfiles(!!workspace);
  const { data: apiKeyStatus } = useApiKeyStatus();
  const { data: preferences } = usePreferences();
  const { data: models } = useModels(!!apiKeyStatus?.isSet);
  const { data: integration } = useIntegration();
  const { data: confluenceIntegration } = useConfluenceIntegration();
  const { data: githubIntegration } = useGitHubIntegration();

  const navigate = useNavigate();
  const runAnalysis = useRunAnalysis();
  const previewPayload = usePayloadPreview();
  const exportMarkdown = useExportMarkdown();

  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [selectedJiraKeys, setSelectedJiraKeys] = useState<string[]>([]);
  const [selectedConfluenceKeys, setSelectedConfluenceKeys] = useState<string[]>([]);
  const [selectedGithubRepos, setSelectedGithubRepos] = useState<string[]>([]);
  const [selectedCodebaseRepos, setSelectedCodebaseRepos] = useState<string[]>([]);
  const [role, setRole] = useState<string>('staff_engineer');
  const [progress, setProgress] = useState<{ stage: string; message: string } | null>(null);
  const [completedAnalysis, setCompletedAnalysis] = useState<Analysis | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const selectedModelId = preferences?.['selectedModelId'] ?? null;
  const selectedModel = models?.find((m) => m.id === selectedModelId);
  const contextWindow = selectedModel?.contextLength ?? 128_000;

  // Jira project keys from integration
  const jiraConfig = integration?.config as { selectedProjectKeys?: string[] } | undefined;
  const jiraProjectKeys: string[] = jiraConfig?.selectedProjectKeys ?? [];

  // Confluence space keys from integration
  const confluenceConfig = confluenceIntegration?.config as { selectedSpaceKeys?: string[] } | undefined;
  const confluenceSpaceKeys: string[] = confluenceConfig?.selectedSpaceKeys ?? [];

  // GitHub repos from integration
  const githubConfig = githubIntegration?.config as { selectedRepos?: string[] } | undefined;
  const githubRepos: string[] = githubConfig?.selectedRepos ?? [];

  // Codebase repos — same as GitHub selected repos (analysis available if cached)
  const codebaseRepos: string[] = githubRepos;

  // Auto-select all profiles when loaded
  useEffect(() => {
    if (profiles && selectedProfileIds.length === 0) {
      setSelectedProfileIds(profiles.map((p) => p.id));
    }
  }, [profiles]);

  // Auto-select all Jira project keys
  useEffect(() => {
    if (jiraProjectKeys.length > 0 && selectedJiraKeys.length === 0) {
      setSelectedJiraKeys(jiraProjectKeys);
    }
  }, [jiraProjectKeys]);

  // Auto-select all Confluence space keys
  useEffect(() => {
    if (confluenceSpaceKeys.length > 0 && selectedConfluenceKeys.length === 0) {
      setSelectedConfluenceKeys(confluenceSpaceKeys);
    }
  }, [confluenceSpaceKeys]);

  // Auto-select all GitHub repos
  useEffect(() => {
    if (githubRepos.length > 0 && selectedGithubRepos.length === 0) {
      setSelectedGithubRepos(githubRepos);
    }
  }, [githubRepos]);

  // Auto-select all codebase repos
  useEffect(() => {
    if (codebaseRepos.length > 0 && selectedCodebaseRepos.length === 0) {
      setSelectedCodebaseRepos(codebaseRepos);
    }
  }, [codebaseRepos]);

  // Recover running or recently-completed analysis on mount
  useEffect(() => {
    if (!activeAnalysisRef.current) return;
    const recoverId = activeAnalysisRef.current;

    const recover = async (): Promise<void> => {
      const result = await window.nswot.analysis.get(recoverId);
      if (!result.success || !mountedRef.current) return;

      const analysis = result.data;
      if (!analysis) return;
      if (analysis.status === 'completed' && analysis.swotOutput) {
        setCompletedAnalysis(analysis);
        setProgress({ stage: 'completed', message: 'Analysis complete!' });
        activeAnalysisRef.current = null;
      } else if (analysis.status === 'failed') {
        setProgress({ stage: 'failed', message: analysis.error ?? 'Analysis failed' });
        setAnalysisError(analysis.error ?? 'Analysis failed');
        activeAnalysisRef.current = null;
      } else if (analysis.status === 'running') {
        setAnalysisRunning(true);
        setProgress({ stage: 'sending', message: 'Analysis in progress...' });
      }
    };
    recover();
  }, []);

  // Listen for progress events
  useEffect(() => {
    const cleanup = window.nswot.analysis.onProgress((data) => {
      activeAnalysisRef.current = data.analysisId;
      setProgress({ stage: data.stage, message: data.message });

      if (data.stage === 'completed') {
        // Fetch the full analysis result from DB
        window.nswot.analysis.get(data.analysisId).then((result) => {
          if (result.success && result.data && mountedRef.current) {
            setCompletedAnalysis(result.data);
          }
          activeAnalysisRef.current = null;
          if (mountedRef.current) setAnalysisRunning(false);
        });
      }

      if (data.stage === 'failed') {
        activeAnalysisRef.current = null;
        if (mountedRef.current) {
          setAnalysisRunning(false);
          setAnalysisError(data.message);
        }
      }
    });
    return cleanup;
  }, []);

  const handleRun = useCallback(async () => {
    if (!selectedModelId || selectedProfileIds.length === 0) return;

    setProgress({ stage: 'collecting', message: 'Starting analysis...' });
    setCompletedAnalysis(null);
    setAnalysisRunning(true);
    setAnalysisError(null);
    setShowPreview(false);

    try {
      const result = await runAnalysis.mutateAsync({
        profileIds: selectedProfileIds,
        jiraProjectKeys: selectedJiraKeys,
        confluenceSpaceKeys: selectedConfluenceKeys,
        githubRepos: selectedGithubRepos,
        codebaseRepos: selectedCodebaseRepos,
        role,
        modelId: selectedModelId,
        contextWindow,
      });
      if (mountedRef.current) {
        setCompletedAnalysis(result);
        setAnalysisRunning(false);
      }
    } catch {
      if (mountedRef.current) {
        setAnalysisRunning(false);
      }
    }
  }, [selectedModelId, selectedProfileIds, selectedJiraKeys, selectedConfluenceKeys, selectedGithubRepos, selectedCodebaseRepos, role, contextWindow, runAnalysis]);

  const handlePreview = useCallback(async () => {
    if (selectedProfileIds.length === 0) return;
    setShowPreview(true);
    previewPayload.mutate({
      profileIds: selectedProfileIds,
      jiraProjectKeys: selectedJiraKeys,
      confluenceSpaceKeys: selectedConfluenceKeys,
      githubRepos: selectedGithubRepos,
      codebaseRepos: selectedCodebaseRepos,
      role,
      contextWindow,
    });
  }, [selectedProfileIds, selectedJiraKeys, selectedConfluenceKeys, selectedGithubRepos, selectedCodebaseRepos, role, contextWindow, previewPayload]);

  if (!workspace) {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold">Analysis</h2>
        <p className="text-gray-400">Open a workspace to run an analysis.</p>
      </div>
    );
  }

  if (!apiKeyStatus?.isSet) {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold">Analysis</h2>
        <p className="text-gray-400">Configure your API key in Settings before running an analysis.</p>
      </div>
    );
  }

  const isRunning = runAnalysis.isPending || analysisRunning;
  const canRun = selectedProfileIds.length > 0 && !!selectedModelId && !isRunning;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Run Analysis</h2>

      {/* Role Selection */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-300">Role Perspective</label>
        <div className="flex gap-3">
          {ROLES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRole(r.value)}
              disabled={isRunning}
              className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                role === r.value
                  ? 'border-blue-500 bg-blue-900/30 text-blue-300'
                  : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Model Display */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-300">Model</label>
        <p className="text-sm text-gray-400">
          {selectedModel ? `${selectedModel.name} (${(selectedModel.contextLength / 1000).toFixed(0)}k context)` : 'No model selected — configure in Settings'}
        </p>
      </div>

      {/* Profile Selection */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-gray-300">
            Profiles ({selectedProfileIds.length} of {profiles?.length ?? 0} selected)
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedProfileIds(profiles?.map((p) => p.id) ?? [])}
              disabled={isRunning}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Select all
            </button>
            <button
              onClick={() => setSelectedProfileIds([])}
              disabled={isRunning}
              className="text-xs text-gray-500 hover:text-gray-400"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-800 bg-gray-900 p-2">
          {profiles && profiles.length > 0 ? (
            profiles.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-800"
              >
                <input
                  type="checkbox"
                  checked={selectedProfileIds.includes(p.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedProfileIds([...selectedProfileIds, p.id]);
                    } else {
                      setSelectedProfileIds(selectedProfileIds.filter((id) => id !== p.id));
                    }
                  }}
                  disabled={isRunning}
                  className="rounded border-gray-600"
                />
                <span className="text-sm text-gray-300">{p.name}</span>
                {p.role && <span className="text-xs text-gray-500">{p.role}</span>}
              </label>
            ))
          ) : (
            <p className="p-2 text-sm text-gray-500">No profiles available. Add profiles first.</p>
          )}
        </div>
      </div>

      {/* Jira Projects */}
      {jiraProjectKeys.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">
              Jira Projects ({selectedJiraKeys.length} selected)
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedJiraKeys(jiraProjectKeys)}
                disabled={isRunning}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Select all
              </button>
              <button
                onClick={() => setSelectedJiraKeys([])}
                disabled={isRunning}
                className="text-xs text-gray-500 hover:text-gray-400"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {jiraProjectKeys.map((key) => (
              <button
                key={key}
                onClick={() => {
                  if (selectedJiraKeys.includes(key)) {
                    setSelectedJiraKeys(selectedJiraKeys.filter((k) => k !== key));
                  } else {
                    setSelectedJiraKeys([...selectedJiraKeys, key]);
                  }
                }}
                disabled={isRunning}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  selectedJiraKeys.includes(key)
                    ? 'bg-blue-900/30 text-blue-300 border border-blue-500'
                    : 'bg-gray-900 text-gray-400 border border-gray-700 hover:border-gray-600'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Confluence Spaces */}
      {confluenceSpaceKeys.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">
              Confluence Spaces ({selectedConfluenceKeys.length} selected)
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedConfluenceKeys(confluenceSpaceKeys)}
                disabled={isRunning}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Select all
              </button>
              <button
                onClick={() => setSelectedConfluenceKeys([])}
                disabled={isRunning}
                className="text-xs text-gray-500 hover:text-gray-400"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {confluenceSpaceKeys.map((key) => (
              <button
                key={key}
                onClick={() => {
                  if (selectedConfluenceKeys.includes(key)) {
                    setSelectedConfluenceKeys(selectedConfluenceKeys.filter((k) => k !== key));
                  } else {
                    setSelectedConfluenceKeys([...selectedConfluenceKeys, key]);
                  }
                }}
                disabled={isRunning}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  selectedConfluenceKeys.includes(key)
                    ? 'bg-teal-900/30 text-teal-300 border border-teal-500'
                    : 'bg-gray-900 text-gray-400 border border-gray-700 hover:border-gray-600'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* GitHub Repos */}
      {githubRepos.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">
              GitHub Repos ({selectedGithubRepos.length} selected)
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedGithubRepos(githubRepos)}
                disabled={isRunning}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Select all
              </button>
              <button
                onClick={() => setSelectedGithubRepos([])}
                disabled={isRunning}
                className="text-xs text-gray-500 hover:text-gray-400"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {githubRepos.map((repo) => (
              <button
                key={repo}
                onClick={() => {
                  if (selectedGithubRepos.includes(repo)) {
                    setSelectedGithubRepos(selectedGithubRepos.filter((r) => r !== repo));
                  } else {
                    setSelectedGithubRepos([...selectedGithubRepos, repo]);
                  }
                }}
                disabled={isRunning}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  selectedGithubRepos.includes(repo)
                    ? 'bg-purple-900/30 text-purple-300 border border-purple-500'
                    : 'bg-gray-900 text-gray-400 border border-gray-700 hover:border-gray-600'
                }`}
              >
                {repo}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Codebase Repos */}
      {codebaseRepos.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">
              Codebase Analysis ({selectedCodebaseRepos.length} selected)
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedCodebaseRepos(codebaseRepos)}
                disabled={isRunning}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Select all
              </button>
              <button
                onClick={() => setSelectedCodebaseRepos([])}
                disabled={isRunning}
                className="text-xs text-gray-500 hover:text-gray-400"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {codebaseRepos.map((repo) => (
              <button
                key={repo}
                onClick={() => {
                  if (selectedCodebaseRepos.includes(repo)) {
                    setSelectedCodebaseRepos(selectedCodebaseRepos.filter((r) => r !== repo));
                  } else {
                    setSelectedCodebaseRepos([...selectedCodebaseRepos, repo]);
                  }
                }}
                disabled={isRunning}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  selectedCodebaseRepos.includes(repo)
                    ? 'bg-amber-900/30 text-amber-300 border border-amber-500'
                    : 'bg-gray-900 text-gray-400 border border-gray-700 hover:border-gray-600'
                }`}
              >
                {repo}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleRun}
          disabled={!canRun}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning ? 'Running...' : 'Run Analysis'}
        </button>
        <button
          onClick={handlePreview}
          disabled={selectedProfileIds.length === 0 || isRunning}
          className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Preview Payload
        </button>
      </div>

      {/* Progress */}
      {isRunning && progress && (
        <div className="rounded-lg border border-blue-800 bg-blue-900/20 p-4">
          <div className="mb-3 flex items-center gap-2">
            {PIPELINE_STEPS.map((step, i) => {
              const currentIdx = STAGE_INDEX[progress.stage] ?? -1;
              const done = i < currentIdx;
              const active = i === currentIdx;
              return (
                <div key={step.key} className="flex items-center gap-2">
                  {i > 0 && (
                    <div className={`h-px w-4 ${done || active ? 'bg-blue-500' : 'bg-gray-700'}`} />
                  )}
                  <div className="flex items-center gap-1.5">
                    {done ? (
                      <svg className="h-4 w-4 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : active ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-gray-600" />
                    )}
                    <span className={`text-xs ${done ? 'text-blue-400' : active ? 'font-medium text-blue-300' : 'text-gray-600'}`}>
                      {step.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-blue-400/70">{progress.message}</p>
        </div>
      )}

      {/* Error */}
      {(runAnalysis.isError || analysisError) && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-4">
          <p className="text-sm text-red-300">
            {runAnalysis.error instanceof Error
              ? runAnalysis.error.message
              : analysisError ?? 'Analysis failed'}
          </p>
        </div>
      )}

      {/* Payload Preview */}
      {showPreview && (
        <PayloadPreview
          data={previewPayload.data ?? null}
          isLoading={previewPayload.isPending}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Results Actions */}
      {completedAnalysis?.swotOutput && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowChat(!showChat)}
            className="rounded-lg border border-green-700 px-4 py-2 text-sm text-green-300 transition-colors hover:border-green-600 hover:text-green-200"
          >
            {showChat ? 'Hide Chat' : 'Chat About Results'}
          </button>
          <button
            onClick={() => navigate(`/themes/${completedAnalysis.id}`)}
            className="rounded-lg border border-teal-700 px-4 py-2 text-sm text-teal-300 transition-colors hover:border-teal-600 hover:text-teal-200"
          >
            View Themes
          </button>
          <button
            onClick={async () => {
              try {
                const markdown = await exportMarkdown.mutateAsync(completedAnalysis.id);
                await navigator.clipboard.writeText(markdown);
                setExportSuccess(true);
                setTimeout(() => setExportSuccess(false), 2000);
              } catch {
                // Error shown via mutation state
              }
            }}
            disabled={exportMarkdown.isPending}
            className="rounded-lg border border-purple-700 px-4 py-2 text-sm text-purple-300 transition-colors hover:border-purple-600 hover:text-purple-200 disabled:opacity-50"
          >
            {exportSuccess ? 'Copied to Clipboard!' : 'Export Markdown'}
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

      {/* Chat */}
      {showChat && completedAnalysis && (
        <ChatPanel
          analysisId={completedAnalysis.id}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* Results */}
      {completedAnalysis?.swotOutput && (
        <SwotResults
          analysis={completedAnalysis}
        />
      )}
    </div>
  );
}
