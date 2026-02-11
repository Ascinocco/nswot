import { useState } from 'react';
import {
  useGitHubIntegration,
  useConnectGitHub,
  useDisconnectGitHub,
  useGitHubRepos,
  useSyncGitHub,
} from '../../hooks/use-integrations';

export default function GitHubSetup(): React.JSX.Element {
  const { data: integration, isLoading } = useGitHubIntegration();
  const isConnected = integration?.status === 'connected' || integration?.status === 'error';

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">GitHub</h3>
      {isConnected ? (
        <ConnectedState integration={integration!} />
      ) : (
        <DisconnectedState />
      )}
    </div>
  );
}

function DisconnectedState(): React.JSX.Element {
  const connectGitHub = useConnectGitHub();
  const [pat, setPat] = useState('');

  const handleConnect = (): void => {
    if (!pat.trim()) return;
    connectGitHub.mutate(pat.trim());
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Enter a GitHub Personal Access Token (fine-grained) with <code>repo</code> read access.
      </p>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm text-gray-300">Personal Access Token</label>
          <input
            type="password"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxx or github_pat_xxxxxxxxxxxx"
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleConnect}
          disabled={!pat.trim() || connectGitHub.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {connectGitHub.isPending ? 'Connecting...' : 'Connect GitHub'}
        </button>
      </div>
      {connectGitHub.isError && (
        <p className="text-sm text-red-400">
          {connectGitHub.error instanceof Error ? connectGitHub.error.message : 'Failed to connect'}
        </p>
      )}
    </div>
  );
}

function ConnectedState({ integration }: { integration: Integration }): React.JSX.Element {
  const disconnectGitHub = useDisconnectGitHub();
  const { data: repos, isLoading: reposLoading } = useGitHubRepos(true);
  const syncGitHub = useSyncGitHub();

  const config = integration.config as GitHubConfig;
  const [selectedRepos, setSelectedRepos] = useState<string[]>(config.selectedRepos);

  const handleToggleRepo = (fullName: string): void => {
    setSelectedRepos((prev) =>
      prev.includes(fullName) ? prev.filter((r) => r !== fullName) : [...prev, fullName],
    );
  };

  const handleSync = (): void => {
    if (selectedRepos.length === 0) return;
    syncGitHub.mutate(selectedRepos);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <StatusBadge status={integration.status} />
      </div>

      {integration.lastSyncedAt && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Last synced:</span>
          <span className="text-sm text-gray-300">
            {new Date(integration.lastSyncedAt).toLocaleString()}
          </span>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-300">Repositories</h4>
        {reposLoading ? (
          <p className="text-sm text-gray-500">Loading repositories...</p>
        ) : repos && repos.length > 0 ? (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {repos.map((repo) => (
              <label
                key={repo.full_name}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-800"
              >
                <input
                  type="checkbox"
                  checked={selectedRepos.includes(repo.full_name)}
                  onChange={() => handleToggleRepo(repo.full_name)}
                  className="rounded border-gray-600"
                />
                <span className="text-sm text-gray-200">{repo.full_name}</span>
                {repo.language && (
                  <span className="text-xs text-gray-500">{repo.language}</span>
                )}
                {repo.private && (
                  <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400">
                    private
                  </span>
                )}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No repositories found.</p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSync}
          disabled={selectedRepos.length === 0 || syncGitHub.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {syncGitHub.isPending ? 'Syncing...' : 'Sync'}
        </button>
        <button
          onClick={() => disconnectGitHub.mutate()}
          disabled={disconnectGitHub.isPending}
          className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {disconnectGitHub.isPending ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>

      {syncGitHub.isSuccess && syncGitHub.data?.warning && (
        <p className="text-sm text-yellow-400">{syncGitHub.data.warning}</p>
      )}
      {syncGitHub.isSuccess && !syncGitHub.data?.warning && (
        <p className="text-sm text-green-400">
          Synced {syncGitHub.data?.syncedCount} items successfully.
        </p>
      )}
      {syncGitHub.isError && (
        <p className="text-sm text-red-400">
          {syncGitHub.error instanceof Error ? syncGitHub.error.message : 'Sync failed'}
        </p>
      )}
      {disconnectGitHub.isError && (
        <p className="text-sm text-red-400">
          {disconnectGitHub.error instanceof Error
            ? disconnectGitHub.error.message
            : 'Failed to disconnect'}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  if (status === 'connected') {
    return (
      <span className="rounded bg-green-900/50 px-2 py-0.5 text-xs text-green-400">
        Connected
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="rounded bg-red-900/50 px-2 py-0.5 text-xs text-red-400">Error</span>
    );
  }
  return (
    <span className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-400">Disconnected</span>
  );
}
