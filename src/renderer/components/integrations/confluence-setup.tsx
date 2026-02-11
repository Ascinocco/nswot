import { useState } from 'react';
import {
  useConfluenceIntegration,
  useConnectConfluence,
  useDisconnectConfluence,
  useConfluenceSpaces,
  useSyncConfluence,
} from '../../hooks/use-integrations';
import { useIntegration } from '../../hooks/use-integrations';

export default function ConfluenceSetup(): React.JSX.Element {
  const { data: confluenceIntegration, isLoading } = useConfluenceIntegration();
  const { data: jiraIntegration } = useIntegration();
  const isConnected =
    confluenceIntegration?.status === 'connected' || confluenceIntegration?.status === 'error';
  const jiraConnected =
    jiraIntegration?.status === 'connected' || jiraIntegration?.status === 'error';

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Confluence Cloud</h3>
      {isConnected ? (
        <ConnectedState integration={confluenceIntegration!} />
      ) : (
        <DisconnectedState jiraConnected={jiraConnected} />
      )}
    </div>
  );
}

function DisconnectedState({ jiraConnected }: { jiraConnected: boolean }): React.JSX.Element {
  const connectConfluence = useConnectConfluence();

  if (!jiraConnected) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          Confluence shares the Atlassian OAuth session with Jira. Connect Jira first to enable
          Confluence.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Confluence will use the same Atlassian OAuth token as Jira. No additional credentials
        needed.
      </p>
      <button
        onClick={() => connectConfluence.mutate()}
        disabled={connectConfluence.isPending}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {connectConfluence.isPending ? 'Connecting...' : 'Connect Confluence'}
      </button>
      {connectConfluence.isError && (
        <p className="text-sm text-red-400">
          {connectConfluence.error instanceof Error
            ? connectConfluence.error.message
            : 'Failed to connect'}
        </p>
      )}
    </div>
  );
}

function ConnectedState({ integration }: { integration: Integration }): React.JSX.Element {
  const disconnectConfluence = useDisconnectConfluence();
  const { data: spaces, isLoading: spacesLoading } = useConfluenceSpaces(true);
  const syncConfluence = useSyncConfluence();

  const config = integration.config as ConfluenceConfig;
  const [selectedKeys, setSelectedKeys] = useState<string[]>(config.selectedSpaceKeys);

  const handleToggleSpace = (key: string): void => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handleSync = (): void => {
    if (selectedKeys.length === 0) return;
    syncConfluence.mutate(selectedKeys);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">Site:</span>
        <span className="text-sm text-gray-200">{config.siteUrl}</span>
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
        <h4 className="text-sm font-medium text-gray-300">Spaces</h4>
        {spacesLoading ? (
          <p className="text-sm text-gray-500">Loading spaces...</p>
        ) : spaces && spaces.length > 0 ? (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {spaces.map((space) => (
              <label
                key={space.key}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-800"
              >
                <input
                  type="checkbox"
                  checked={selectedKeys.includes(space.key)}
                  onChange={() => handleToggleSpace(space.key)}
                  className="rounded border-gray-600"
                />
                <span className="text-sm text-gray-200">
                  {space.key} — {space.name}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No spaces found.</p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSync}
          disabled={selectedKeys.length === 0 || syncConfluence.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {syncConfluence.isPending ? 'Syncing...' : 'Sync'}
        </button>
        <button
          onClick={() => disconnectConfluence.mutate()}
          disabled={disconnectConfluence.isPending}
          className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {disconnectConfluence.isPending ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>

      {syncConfluence.isSuccess && syncConfluence.data?.warning && (
        <p className="text-sm text-yellow-400">{syncConfluence.data.warning}</p>
      )}
      {syncConfluence.isSuccess && !syncConfluence.data?.warning && (
        <p className="text-sm text-green-400">
          Synced {syncConfluence.data?.syncedCount} items successfully.
        </p>
      )}
      {syncConfluence.isError && (
        <p className="text-sm text-red-400">
          {syncConfluence.error instanceof Error ? syncConfluence.error.message : 'Sync failed'}
        </p>
      )}
      {disconnectConfluence.isError && (
        <p className="text-sm text-red-400">
          {disconnectConfluence.error instanceof Error
            ? disconnectConfluence.error.message
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
