import { useState } from 'react';
import { usePreferences, useSetPreference, useApiKeyStatus, useSetApiKey, useModels } from '../../hooks/use-settings';

export default function ProviderPicker(): React.JSX.Element {
  const { data: preferences, isLoading: prefsLoading } = usePreferences();
  const setPreference = useSetPreference();
  const { data: keyStatus } = useApiKeyStatus();
  const setApiKey = useSetApiKey();
  const [apiKeyInput, setApiKeyInput] = useState('');

  const currentProvider = preferences?.['llmProviderType'] ?? 'openrouter';
  const keyIsConfigured = keyStatus?.isSet ?? false;
  const { data: models, isLoading: modelsLoading } = useModels(keyIsConfigured);
  const selectedModelId = preferences?.['selectedModelId'] ?? null;

  const handleProviderChange = (provider: string): void => {
    setPreference.mutate({ key: 'llmProviderType', value: provider });
    window.nswot.llm.setProvider(provider).catch((err: unknown) => {
      console.error('[provider-picker] Failed to set provider:', err);
    });
  };

  const handleSaveKey = (): void => {
    if (!apiKeyInput.trim()) return;
    setApiKey.mutate(apiKeyInput.trim(), {
      onSuccess: () => setApiKeyInput(''),
    });
  };

  const handleClearKey = (): void => {
    setApiKey.mutate('', {
      onSuccess: () => setApiKeyInput(''),
    });
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setPreference.mutate({ key: 'selectedModelId', value: e.target.value });
  };

  if (prefsLoading) {
    return <div className="text-sm text-gray-500">Loading...</div>;
  }

  const placeholder = currentProvider === 'anthropic' ? 'sk-ant-...' : 'sk-or-...';

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-300">LLM Provider</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleProviderChange('openrouter')}
            className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
              currentProvider === 'openrouter'
                ? 'border-blue-500 bg-blue-900/20'
                : 'border-gray-700 bg-gray-900 hover:border-gray-600'
            }`}
          >
            <div className="text-sm font-medium text-white">OpenRouter</div>
            <div className="text-xs text-gray-400">Access many models through a unified API</div>
          </button>
          <button
            type="button"
            onClick={() => handleProviderChange('anthropic')}
            className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
              currentProvider === 'anthropic'
                ? 'border-blue-500 bg-blue-900/20'
                : 'border-gray-700 bg-gray-900 hover:border-gray-600'
            }`}
          >
            <div className="text-sm font-medium text-white">Anthropic</div>
            <div className="text-xs text-gray-400">Direct access to Claude models</div>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-300">
          {currentProvider === 'anthropic' ? 'Anthropic' : 'OpenRouter'} API Key
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Status:</span>
          {keyIsConfigured ? (
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
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={placeholder}
            className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleSaveKey}
            disabled={!apiKeyInput.trim() || setApiKey.isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {setApiKey.isPending ? 'Saving...' : 'Save'}
          </button>
          {keyIsConfigured && (
            <button
              onClick={handleClearKey}
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

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-300">Model</h4>
        {!keyIsConfigured ? (
          <p className="text-sm text-gray-500">Configure your API key to select a model.</p>
        ) : modelsLoading ? (
          <p className="text-sm text-gray-500">Loading models...</p>
        ) : !models || models.length === 0 ? (
          <p className="text-sm text-gray-500">No models available.</p>
        ) : (
          <select
            value={selectedModelId ?? ''}
            onChange={handleModelChange}
            className="w-full max-w-md rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="" disabled>
              Select a model...
            </option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
