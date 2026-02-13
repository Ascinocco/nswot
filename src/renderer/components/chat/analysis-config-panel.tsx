import { useState, useCallback } from 'react';
import { useProfiles } from '../../hooks/use-profiles';
import { usePreferences, useModels } from '../../hooks/use-settings';
import {
  useIntegration,
  useJiraProjects,
  useConfluenceIntegration,
  useConfluenceSpaces,
  useGitHubIntegration,
  useGitHubRepos,
  useCodebaseListCached,
} from '../../hooks/use-integrations';

interface AnalysisConfigPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  onRun: (config: AnalysisConfig) => void;
  isRunning: boolean;
}

export interface AnalysisConfig {
  role: string;
  profileIds: string[];
  jiraProjectKeys: string[];
  confluenceSpaceKeys: string[];
  githubRepos: string[];
  codebaseRepos: string[];
  modelId: string;
  contextWindow: number;
}

const ROLES = [
  { value: 'staff_engineer', label: 'Staff Engineer' },
  { value: 'senior_em', label: 'Senior EM' },
  { value: 'vp_engineering', label: 'VP Engineering' },
] as const;

export default function AnalysisConfigPanel({
  collapsed,
  onToggle,
  onRun,
  isRunning,
}: AnalysisConfigPanelProps): React.JSX.Element {
  const { data: profiles } = useProfiles(true);
  const { data: preferences } = usePreferences();
  const { data: models } = useModels(true);

  // Integration status queries
  const { data: jiraIntegration } = useIntegration();
  const { data: confluenceIntegration } = useConfluenceIntegration();
  const { data: githubIntegration } = useGitHubIntegration();
  const { data: cachedCodebaseRepos } = useCodebaseListCached();

  const jiraConnected = jiraIntegration?.status === 'connected';
  const confluenceConnected = confluenceIntegration?.status === 'connected';
  const githubConnected = githubIntegration?.status === 'connected';
  const hasCodebaseRepos = (cachedCodebaseRepos?.length ?? 0) > 0;

  // Conditionally fetch available items
  const { data: jiraProjects } = useJiraProjects(jiraConnected);
  const { data: confluenceSpaces } = useConfluenceSpaces(confluenceConnected);
  const { data: githubRepos } = useGitHubRepos(githubConnected);

  const [role, setRole] = useState('staff_engineer');
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [selectedJiraKeys, setSelectedJiraKeys] = useState<string[]>([]);
  const [selectedConfluenceKeys, setSelectedConfluenceKeys] = useState<string[]>([]);
  const [selectedGithubRepos, setSelectedGithubRepos] = useState<string[]>([]);
  const [selectedCodebaseRepos, setSelectedCodebaseRepos] = useState<string[]>([]);

  const defaultModelId = preferences?.selectedModelId ?? '';
  const [modelId, setModelId] = useState(defaultModelId);
  // Sync default when preferences load
  if (!modelId && defaultModelId) {
    setModelId(defaultModelId);
  }

  const handleProfileToggle = useCallback((id: string) => {
    setSelectedProfileIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  const handleSelectAllProfiles = useCallback(() => {
    if (!profiles) return;
    setSelectedProfileIds(
      selectedProfileIds.length === profiles.length ? [] : profiles.map((p) => p.id),
    );
  }, [profiles, selectedProfileIds]);

  const handleRun = useCallback(() => {
    onRun({
      role,
      profileIds: selectedProfileIds,
      jiraProjectKeys: selectedJiraKeys,
      confluenceSpaceKeys: selectedConfluenceKeys,
      githubRepos: selectedGithubRepos,
      codebaseRepos: selectedCodebaseRepos,
      modelId: modelId || 'anthropic/claude-sonnet-4-5-20250929',
      contextWindow: 200_000,
    });
  }, [role, selectedProfileIds, selectedJiraKeys, selectedConfluenceKeys, selectedGithubRepos, selectedCodebaseRepos, onRun, modelId]);

  const toggleItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    setList(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-gray-300">Analysis Configuration</span>
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="border-t border-gray-800 px-4 py-4 space-y-4">
          {/* Role selector */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Role / Perspective</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Model selector */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Model</label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
            >
              {models && models.length > 0 ? (
                models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({Math.round(m.contextLength / 1000)}k)
                  </option>
                ))
              ) : (
                <option value="">Loading models...</option>
              )}
            </select>
          </div>

          {/* Profile picker */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-400">Profiles</label>
              <button
                onClick={handleSelectAllProfiles}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {selectedProfileIds.length === (profiles?.length ?? 0) ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto rounded border border-gray-700 bg-gray-950 p-2">
              {profiles && profiles.length > 0 ? (
                profiles.map((profile) => (
                  <label key={profile.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-800">
                    <input
                      type="checkbox"
                      checked={selectedProfileIds.includes(profile.id)}
                      onChange={() => handleProfileToggle(profile.id)}
                      className="rounded border-gray-600"
                    />
                    <span className="text-sm text-gray-300">{profile.name}</span>
                    {profile.role && (
                      <span className="text-xs text-gray-500">({profile.role})</span>
                    )}
                  </label>
                ))
              ) : (
                <p className="py-2 text-center text-xs text-gray-500">No profiles found</p>
              )}
            </div>
          </div>

          {/* Data Sources */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Data Sources (optional)</label>
            <div className="space-y-2">
              {/* Jira */}
              {jiraConnected && jiraProjects && jiraProjects.length > 0 && (
                <div>
                  <div className="mb-0.5 text-xs text-gray-500">Jira Projects</div>
                  <div className="max-h-24 overflow-y-auto rounded border border-gray-700 bg-gray-950 p-1.5">
                    {jiraProjects.map((p) => (
                      <label key={p.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-0.5 hover:bg-gray-800">
                        <input
                          type="checkbox"
                          checked={selectedJiraKeys.includes(p.key)}
                          onChange={() => toggleItem(selectedJiraKeys, setSelectedJiraKeys, p.key)}
                          className="rounded border-gray-600"
                        />
                        <span className="text-xs text-gray-300">{p.key} — {p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Confluence */}
              {confluenceConnected && confluenceSpaces && confluenceSpaces.length > 0 && (
                <div>
                  <div className="mb-0.5 text-xs text-gray-500">Confluence Spaces</div>
                  <div className="max-h-24 overflow-y-auto rounded border border-gray-700 bg-gray-950 p-1.5">
                    {confluenceSpaces.map((s) => (
                      <label key={s.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-0.5 hover:bg-gray-800">
                        <input
                          type="checkbox"
                          checked={selectedConfluenceKeys.includes(s.key)}
                          onChange={() => toggleItem(selectedConfluenceKeys, setSelectedConfluenceKeys, s.key)}
                          className="rounded border-gray-600"
                        />
                        <span className="text-xs text-gray-300">{s.key} — {s.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* GitHub */}
              {githubConnected && githubRepos && githubRepos.length > 0 && (
                <div>
                  <div className="mb-0.5 text-xs text-gray-500">GitHub Repos</div>
                  <div className="max-h-24 overflow-y-auto rounded border border-gray-700 bg-gray-950 p-1.5">
                    {githubRepos.map((r) => (
                      <label key={r.full_name} className="flex cursor-pointer items-center gap-2 rounded px-2 py-0.5 hover:bg-gray-800">
                        <input
                          type="checkbox"
                          checked={selectedGithubRepos.includes(r.full_name)}
                          onChange={() => toggleItem(selectedGithubRepos, setSelectedGithubRepos, r.full_name)}
                          className="rounded border-gray-600"
                        />
                        <span className="text-xs text-gray-300">{r.full_name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Codebase */}
              {hasCodebaseRepos && cachedCodebaseRepos && (
                <div>
                  <div className="mb-0.5 text-xs text-gray-500">Codebase Analyses</div>
                  <div className="max-h-24 overflow-y-auto rounded border border-gray-700 bg-gray-950 p-1.5">
                    {cachedCodebaseRepos.map((r) => (
                      <label key={r.repo} className="flex cursor-pointer items-center gap-2 rounded px-2 py-0.5 hover:bg-gray-800">
                        <input
                          type="checkbox"
                          checked={selectedCodebaseRepos.includes(r.repo)}
                          onChange={() => toggleItem(selectedCodebaseRepos, setSelectedCodebaseRepos, r.repo)}
                          className="rounded border-gray-600"
                        />
                        <span className="text-xs text-gray-300">{r.repo}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {!jiraConnected && !confluenceConnected && !githubConnected && !hasCodebaseRepos && (
                <p className="text-xs text-gray-500">
                  No integrations configured. Analysis will use profiles only.{' '}
                  <span className="text-blue-400">Configure in Settings.</span>
                </p>
              )}
            </div>
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={isRunning || selectedProfileIds.length === 0}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {isRunning ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Running Analysis...
              </span>
            ) : (
              'Run Analysis'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
