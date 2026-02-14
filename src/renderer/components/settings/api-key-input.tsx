import { useState } from 'react';
import { useApiKeyStatus, useSetApiKey } from '../../hooks/use-settings';

export default function ApiKeyInput(): React.JSX.Element {
  const [value, setValue] = useState('');
  const { data: status, isLoading } = useApiKeyStatus();
  const setApiKey = useSetApiKey();

  const handleSave = (): void => {
    if (!value.trim()) return;
    setApiKey.mutate({ apiKey: value.trim() }, {
      onSuccess: () => setValue(''),
    });
  };

  const handleClear = (): void => {
    setApiKey.mutate({ apiKey: '' }, {
      onSuccess: () => setValue(''),
    });
  };

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">Status:</span>
        {status?.isSet ? (
          <span className="rounded bg-green-900/50 px-2 py-0.5 text-xs text-green-400">
            Configured
          </span>
        ) : (
          <span className="rounded bg-yellow-900/50 px-2 py-0.5 text-xs text-yellow-400">
            Not configured
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="sk-or-..."
          className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={handleSave}
          disabled={!value.trim() || setApiKey.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {setApiKey.isPending ? 'Saving...' : 'Save'}
        </button>
        {status?.isSet && (
          <button
            onClick={handleClear}
            disabled={setApiKey.isPending}
            className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>

      {setApiKey.isError && (
        <p className="text-sm text-red-400">
          {setApiKey.error instanceof Error ? setApiKey.error.message : 'Failed to update API key'}
        </p>
      )}
    </div>
  );
}
