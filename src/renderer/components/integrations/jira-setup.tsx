import { useState } from 'react';
import {
  useIntegration,
  useConnectJira,
  useDisconnectJira,
  useJiraProjects,
  useSyncJira,
} from '../../hooks/use-integrations';
import { usePreferences, useSetPreference } from '../../hooks/use-settings';

export default function JiraSetup(): React.JSX.Element {
  const { data: integration, isLoading } = useIntegration();
  const isConnected = integration?.status === 'connected' || integration?.status === 'error';

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Jira Cloud</h3>
      {isConnected ? (
        <ConnectedState integration={integration!} />
      ) : (
        <DisconnectedState />
      )}
    </div>
  );
}

function DisconnectedState(): React.JSX.Element {
  const { data: preferences } = usePreferences();
  const setPreference = useSetPreference();
  const connectJira = useConnectJira();

  const [clientId, setClientId] = useState(preferences?.['jiraClientId'] ?? '');
  const [clientSecret, setClientSecret] = useState(preferences?.['jiraClientSecret'] ?? '');

  const handleConnect = (): void => {
    if (!clientId.trim() || !clientSecret.trim()) return;

    // Persist credentials for re-use
    setPreference.mutate({ key: 'jiraClientId', value: clientId.trim() });
    setPreference.mutate({ key: 'jiraClientSecret', value: clientSecret.trim() });

    connectJira.mutate({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Enter your Atlassian OAuth 2.0 app credentials to connect Jira Cloud.
      </p>
      <div className="rounded border border-gray-800 bg-gray-900 p-3">
        <p className="text-xs text-gray-500">
          In your Atlassian app settings, set the callback URL to:
        </p>
        <code className="mt-1 block text-xs text-blue-400">
          http://localhost:17839/callback
        </code>
      </div>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm text-gray-300">Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Your Atlassian OAuth Client ID"
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-300">Client Secret</label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Your Atlassian OAuth Client Secret"
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleConnect}
          disabled={!clientId.trim() || !clientSecret.trim() || connectJira.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {connectJira.isPending ? 'Connecting...' : 'Connect Jira'}
        </button>
      </div>
      {connectJira.isError && (
        <p className="text-sm text-red-400">
          {connectJira.error instanceof Error ? connectJira.error.message : 'Failed to connect'}
        </p>
      )}
    </div>
  );
}

function ConnectedState({ integration }: { integration: Integration }): React.JSX.Element {
  const disconnectJira = useDisconnectJira();
  const { data: projects, isLoading: projectsLoading } = useJiraProjects(true);
  const syncJira = useSyncJira();

  const [selectedKeys, setSelectedKeys] = useState<string[]>(
    (integration.config as { selectedProjectKeys?: string[] }).selectedProjectKeys ?? [],
  );

  const handleToggleProject = (key: string): void => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handleSync = (): void => {
    if (selectedKeys.length === 0) return;
    syncJira.mutate(selectedKeys);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">Site:</span>
        <span className="text-sm text-gray-200">{(integration.config as { siteUrl?: string }).siteUrl}</span>
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
        <h4 className="text-sm font-medium text-gray-300">Projects</h4>
        {projectsLoading ? (
          <p className="text-sm text-gray-500">Loading projects...</p>
        ) : projects && projects.length > 0 ? (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {projects.map((project) => (
              <label
                key={project.key}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-800"
              >
                <input
                  type="checkbox"
                  checked={selectedKeys.includes(project.key)}
                  onChange={() => handleToggleProject(project.key)}
                  className="rounded border-gray-600"
                />
                <span className="text-sm text-gray-200">
                  {project.key} — {project.name}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No projects found.</p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSync}
          disabled={selectedKeys.length === 0 || syncJira.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {syncJira.isPending ? 'Syncing...' : 'Sync'}
        </button>
        <button
          onClick={() => disconnectJira.mutate()}
          disabled={disconnectJira.isPending}
          className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {disconnectJira.isPending ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>

      {syncJira.isSuccess && syncJira.data?.warning && (
        <p className="text-sm text-yellow-400">{syncJira.data.warning}</p>
      )}
      {syncJira.isSuccess && !syncJira.data?.warning && (
        <p className="text-sm text-green-400">
          Synced {syncJira.data?.syncedCount} items successfully.
        </p>
      )}
      {syncJira.isError && (
        <p className="text-sm text-red-400">
          {syncJira.error instanceof Error ? syncJira.error.message : 'Sync failed'}
        </p>
      )}
      {disconnectJira.isError && (
        <p className="text-sm text-red-400">
          {disconnectJira.error instanceof Error
            ? disconnectJira.error.message
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
