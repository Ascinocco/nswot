import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  useGitHubIntegration,
  useGitHubRepos,
  useCodebasePrerequisites,
  useCodebaseAnalyze,
  useCodebaseClearRepos,
  useCodebaseProgress,
  useCodebaseListCached,
  useCodebaseStorageSize,
} from '../../hooks/use-integrations';
import { usePreferences, useSetPreference } from '../../hooks/use-settings';

interface RepoProgress {
  stage: 'cloning' | 'analyzing' | 'parsing' | 'done' | 'failed';
  message: string;
  recentMessages: string[];
}

export default function CodebaseSetup(): React.JSX.Element {
  const { data: githubIntegration } = useGitHubIntegration();
  const githubConnected = githubIntegration?.status === 'connected';

  const { data: prereqs, isLoading: prereqsLoading } = useCodebasePrerequisites(true);

  const allPrereqsMet = Boolean(prereqs?.cli && prereqs?.cliAuthenticated && prereqs?.git);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Codebase Analysis</h3>
      <p className="text-sm text-gray-400">
        Analyze repositories using Claude CLI to surface architecture, code quality, technical debt, and risks as SWOT evidence.
      </p>

      <CodebaseProviderPicker />

      <PrerequisitesCard prereqs={prereqs ?? null} isLoading={prereqsLoading} />

      {allPrereqsMet && githubConnected && (
        <RepoAnalysisCard githubIntegration={githubIntegration!} jiraMcpAvailable={prereqs?.jiraMcp ?? false} />
      )}

      {allPrereqsMet && githubConnected && <StorageCard />}

      {!githubConnected && allPrereqsMet && (
        <p className="text-sm text-yellow-400">
          Connect GitHub first to select repositories for codebase analysis.
        </p>
      )}
    </div>
  );
}

function PrerequisitesCard({
  prereqs,
  isLoading,
}: {
  prereqs: CodebasePrerequisites | null;
  isLoading: boolean;
}): React.JSX.Element {
  if (isLoading) {
    return <p className="text-sm text-gray-500">Checking prerequisites...</p>;
  }

  if (!prereqs) {
    return <p className="text-sm text-gray-500">Unable to check prerequisites.</p>;
  }

  return (
    <div className="space-y-2 rounded border border-gray-700 p-4">
      <h4 className="text-sm font-medium text-gray-300">Prerequisites</h4>
      <div className="space-y-1">
        <PrereqItem label="Claude CLI installed" ok={prereqs.cli} />
        <PrereqItem label="Claude CLI authenticated" ok={prereqs.cliAuthenticated} />
        <PrereqItem label="Git installed" ok={prereqs.git} />
        <PrereqItem label="Jira MCP configured" ok={prereqs.jiraMcp} optional />
      </div>
    </div>
  );
}

function PrereqItem({
  label,
  ok,
  optional,
}: {
  label: string;
  ok: boolean;
  optional?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <span className="text-green-400">&#10003;</span>
      ) : (
        <span className={optional ? 'text-yellow-400' : 'text-red-400'}>&#10007;</span>
      )}
      <span className={ok ? 'text-gray-200' : optional ? 'text-yellow-300' : 'text-red-300'}>
        {label}
      </span>
      {optional && !ok && <span className="text-xs text-gray-500">(optional)</span>}
    </div>
  );
}

function RepoAnalysisCard({
  githubIntegration,
  jiraMcpAvailable,
}: {
  githubIntegration: Integration;
  jiraMcpAvailable: boolean;
}): React.JSX.Element {
  const config = githubIntegration.config as GitHubConfig;
  const repos = config.selectedRepos;

  const { data: githubRepos } = useGitHubRepos(true);
  const { data: cachedAnalyses } = useCodebaseListCached();

  const analyzeCodebase = useCodebaseAnalyze();
  const clearRepos = useCodebaseClearRepos();

  const [progressMap, setProgressMap] = useState<Record<string, RepoProgress>>({});
  const [selectedRepos, setSelectedRepos] = useState<string[]>(repos);
  const [fullClone, setFullClone] = useState(false);
  const [depth, setDepth] = useState<'standard' | 'deep'>('standard');

  const handleProgress = useCallback((data: CodebaseProgress) => {
    setProgressMap((prev) => {
      const existing = prev[data.repo];
      const recentMessages = existing?.recentMessages ?? [];
      // Keep last 8 messages for the activity log
      const updated = data.message
        ? [...recentMessages, data.message].slice(-8)
        : recentMessages;
      return {
        ...prev,
        [data.repo]: { stage: data.stage, message: data.message, recentMessages: updated },
      };
    });
  }, []);

  useCodebaseProgress(handleProgress);

  // Build a map of repo -> analysis info for staleness detection
  const analysisMap = useMemo(() => {
    const map = new Map<string, RepoAnalysisInfo>();
    if (cachedAnalyses) {
      for (const info of cachedAnalyses) {
        map.set(info.repo, info);
      }
    }
    return map;
  }, [cachedAnalyses]);

  // Build a map of repo -> GitHub updated_at for staleness comparison
  const repoUpdatedMap = useMemo(() => {
    const map = new Map<string, string>();
    if (githubRepos) {
      for (const repo of githubRepos) {
        map.set(repo.full_name, repo.updated_at);
      }
    }
    return map;
  }, [githubRepos]);

  const handleAnalyze = (reposToAnalyze: string[]): void => {
    setProgressMap({});
    analyzeCodebase.mutate({
      repos: reposToAnalyze,
      options: { shallow: !fullClone, depth },
    });
  };

  const handleReanalyze = (repo: string): void => {
    setProgressMap({});
    analyzeCodebase.mutate({
      repos: [repo],
      options: { shallow: !fullClone, depth },
    });
  };

  const handleToggleRepo = (fullName: string): void => {
    setSelectedRepos((prev) =>
      prev.includes(fullName) ? prev.filter((r) => r !== fullName) : [...prev, fullName],
    );
  };

  if (repos.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No repositories selected in GitHub integration. Select repos in GitHub setup first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-300">Repositories</h4>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {repos.map((repo) => {
            const progress = progressMap[repo];
            const analysisInfo = analysisMap.get(repo);
            const repoUpdatedAt = repoUpdatedMap.get(repo);
            const isStale = analysisInfo && repoUpdatedAt
              ? new Date(repoUpdatedAt) > new Date(analysisInfo.analyzedAt)
              : false;

            return (
              <div key={repo} className="rounded px-2 py-1 hover:bg-gray-800">
                <div className="flex items-center gap-2">
                  <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedRepos.includes(repo)}
                      onChange={() => handleToggleRepo(repo)}
                      className="rounded border-gray-600"
                    />
                    <span className="text-sm text-gray-200">{repo}</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    {analysisInfo && (
                      <span className="text-xs text-gray-500" title={`Analyzed: ${new Date(analysisInfo.analyzedAt).toLocaleString()}`}>
                        {formatRelativeTime(analysisInfo.analyzedAt)}
                      </span>
                    )}
                    {isStale && (
                      <span className="rounded bg-yellow-900/50 px-1.5 py-0.5 text-xs text-yellow-400" title="Repository has been updated since last analysis">
                        stale
                      </span>
                    )}
                    {analysisInfo && !analyzeCodebase.isPending && (
                      <button
                        onClick={() => handleReanalyze(repo)}
                        className="rounded px-1.5 py-0.5 text-xs text-blue-400 hover:bg-blue-900/30"
                        title="Re-analyze this repository"
                      >
                        re-analyze
                      </button>
                    )}
                    {progress && <ProgressBadge stage={progress.stage} message={progress.message} />}
                  </div>
                </div>
                {progress && progress.stage === 'analyzing' && progress.recentMessages.length > 0 && (
                  <div className="ml-6 mt-1 max-h-28 space-y-0.5 overflow-y-auto rounded bg-gray-900/50 px-2 py-1">
                    {progress.recentMessages.map((msg, i) => (
                      <p key={i} className={`truncate text-xs ${i === progress.recentMessages.length - 1 ? 'text-gray-400' : 'text-gray-600'}`}>
                        {msg}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Analysis options */}
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <span className="text-gray-400">Depth:</span>
            <button
              onClick={() => setDepth('standard')}
              className={`rounded px-2.5 py-1 text-xs font-medium ${depth === 'standard' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
            >
              Standard
            </button>
            <button
              onClick={() => setDepth('deep')}
              className={`rounded px-2.5 py-1 text-xs font-medium ${depth === 'deep' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
            >
              Deep
            </button>
          </div>
          <span className="text-xs text-gray-500">
            {depth === 'standard' ? 'Breadth-first, ~20 min (20 turns, 30 min timeout)' : 'Thorough analysis, ~60 min (50 turns, 90 min timeout)'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={fullClone}
              onChange={(e) => setFullClone(e.target.checked)}
              className="rounded border-gray-600"
            />
            Full clone (includes git history for churn analysis)
          </label>
          {!jiraMcpAvailable && (
            <span className="text-xs text-gray-500">
              Jira MCP not configured — cross-reference will be skipped
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => handleAnalyze(selectedRepos)}
          disabled={selectedRepos.length === 0 || analyzeCodebase.isPending}
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {analyzeCodebase.isPending ? 'Analyzing...' : `Analyze ${selectedRepos.length > 1 ? `${selectedRepos.length} Repos` : 'Repo'}`}
        </button>
        <button
          onClick={() => clearRepos.mutate()}
          disabled={clearRepos.isPending}
          className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {clearRepos.isPending ? 'Clearing...' : 'Clear Cached Analyses'}
        </button>
      </div>

      {analyzeCodebase.isSuccess && (
        <div className="space-y-1">
          {analyzeCodebase.data.results.length > 0 && (
            <p className="text-sm text-green-400">
              Analyzed {analyzeCodebase.data.results.length} repo(s) successfully.
            </p>
          )}
          {analyzeCodebase.data.failures.length > 0 && (
            <div className="space-y-1">
              {analyzeCodebase.data.failures.map((f) => (
                <p key={f.repo} className="text-sm text-red-400">
                  {f.repo}: {f.error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {analyzeCodebase.isError && (
        <p className="text-sm text-red-400">
          {analyzeCodebase.error instanceof Error ? analyzeCodebase.error.message : 'Analysis failed'}
        </p>
      )}

      {clearRepos.isSuccess && (
        <p className="text-sm text-green-400">Cached analyses cleared.</p>
      )}
    </div>
  );
}

function StorageCard(): React.JSX.Element {
  const { data: storageInfo } = useCodebaseStorageSize();

  if (!storageInfo || (storageInfo.totalBytes === 0 && storageInfo.repoCount === 0)) {
    return <></>;
  }

  return (
    <div className="rounded border border-gray-700 p-4">
      <h4 className="text-sm font-medium text-gray-300">Cloned Repository Storage</h4>
      <p className="mt-1 text-sm text-gray-400">
        {storageInfo.repoCount} repo(s) cloned, using {formatBytes(storageInfo.totalBytes)}
      </p>
    </div>
  );
}

function ProgressBadge({
  stage,
  message,
}: {
  stage: string;
  message: string;
}): React.JSX.Element {
  const colors: Record<string, string> = {
    cloning: 'bg-blue-900/50 text-blue-400',
    analyzing: 'bg-amber-900/50 text-amber-400',
    parsing: 'bg-amber-900/50 text-amber-400',
    done: 'bg-green-900/50 text-green-400',
    failed: 'bg-red-900/50 text-red-400',
  };

  const isActive = stage === 'analyzing' || stage === 'cloning';
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
  }, [stage]);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  const elapsedLabel = elapsed > 0
    ? elapsed < 60
      ? `${elapsed}s`
      : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : '';

  if (stage === 'failed') {
    return (
      <span className="rounded bg-red-900/50 px-2 py-0.5 text-xs text-red-400" title={message}>
        failed
      </span>
    );
  }

  if (stage === 'done') {
    const isPartial = message.includes('Partial') || message.includes('partial');
    return (
      <span
        className={`rounded px-2 py-0.5 text-xs ${isPartial ? 'bg-yellow-900/50 text-yellow-400' : 'bg-green-900/50 text-green-400'}`}
        title={message}
      >
        {isPartial ? 'partial' : 'done'}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs ${colors[stage] ?? 'bg-gray-700 text-gray-400'}`}
      title={message}
    >
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      <span>{stage}</span>
      {elapsedLabel && <span className="tabular-nums text-[10px] opacity-70">{elapsedLabel}</span>}
    </span>
  );
}

function CodebaseProviderPicker(): React.JSX.Element {
  const { data: preferences, isLoading } = usePreferences();
  const setPreference = useSetPreference();

  const currentProvider = preferences?.['codebaseProviderType'] ?? 'claude_cli';

  const handleChange = (provider: string): void => {
    setPreference.mutate({ key: 'codebaseProviderType', value: provider });
  };

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-300">Analysis Provider</h4>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => handleChange('claude_cli')}
          className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
            currentProvider === 'claude_cli'
              ? 'border-amber-500 bg-amber-900/20'
              : 'border-gray-700 bg-gray-900 hover:border-gray-600'
          }`}
        >
          <div className="text-sm font-medium text-white">Claude CLI</div>
          <div className="text-xs text-gray-400">Recommended &mdash; deep code analysis via Claude</div>
        </button>
        <button
          type="button"
          onClick={() => handleChange('opencode')}
          className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
            currentProvider === 'opencode'
              ? 'border-amber-500 bg-amber-900/20'
              : 'border-gray-700 bg-gray-900 hover:border-gray-600'
          }`}
        >
          <div className="text-sm font-medium text-white">OpenCode</div>
          <div className="text-xs text-gray-400">Experimental &mdash; alternative CLI tool</div>
        </button>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
