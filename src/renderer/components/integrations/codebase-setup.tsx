import { useState, useCallback } from 'react';
import {
  useGitHubIntegration,
  useCodebasePrerequisites,
  useCodebaseAnalyze,
  useCodebaseClearRepos,
  useCodebaseProgress,
} from '../../hooks/use-integrations';

interface RepoProgress {
  stage: 'cloning' | 'analyzing' | 'parsing' | 'done' | 'failed';
  message: string;
}

export default function CodebaseSetup(): React.JSX.Element {
  const { data: githubIntegration } = useGitHubIntegration();
  const githubConnected = githubIntegration?.status === 'connected';

  const { data: prereqs, isLoading: prereqsLoading } = useCodebasePrerequisites(true);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Codebase Analysis</h3>
      <p className="text-sm text-gray-400">
        Analyze repositories using Claude CLI to surface architecture, code quality, technical debt, and risks as SWOT evidence.
      </p>

      <PrerequisitesCard prereqs={prereqs ?? null} isLoading={prereqsLoading} />

      {prereqs?.cli && prereqs?.cliAuthenticated && prereqs?.git && githubConnected && (
        <RepoAnalysisCard githubIntegration={githubIntegration!} />
      )}

      {!githubConnected && prereqs?.cli && prereqs?.cliAuthenticated && prereqs?.git && (
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
}: {
  githubIntegration: Integration;
}): React.JSX.Element {
  const config = githubIntegration.config as GitHubConfig;
  const repos = config.selectedRepos;

  const analyzeCodebase = useCodebaseAnalyze();
  const clearRepos = useCodebaseClearRepos();

  const [progressMap, setProgressMap] = useState<Record<string, RepoProgress>>({});
  const [selectedRepos, setSelectedRepos] = useState<string[]>(repos);

  const handleProgress = useCallback((data: CodebaseProgress) => {
    setProgressMap((prev) => ({
      ...prev,
      [data.repo]: { stage: data.stage, message: data.message },
    }));
  }, []);

  useCodebaseProgress(handleProgress);

  const handleAnalyze = (reposToAnalyze: string[]): void => {
    setProgressMap({});
    analyzeCodebase.mutate({ repos: reposToAnalyze });
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
            return (
              <div key={repo} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-gray-800">
                <label className="flex flex-1 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedRepos.includes(repo)}
                    onChange={() => handleToggleRepo(repo)}
                    className="rounded border-gray-600"
                  />
                  <span className="text-sm text-gray-200">{repo}</span>
                </label>
                {progress && <ProgressBadge stage={progress.stage} message={progress.message} />}
              </div>
            );
          })}
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

  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${colors[stage] ?? 'bg-gray-700 text-gray-400'}`}
      title={message}
    >
      {stage}
    </span>
  );
}
