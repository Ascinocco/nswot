import { useState } from 'react';
import { useApiKeyStatus, useSetApiKey } from '../../hooks/use-settings';

interface ApiKeyStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function ApiKeyStep({ onNext, onBack }: ApiKeyStepProps): React.JSX.Element {
  const [provider, setProvider] = useState<'openrouter' | 'anthropic'>('openrouter');
  const [apiKey, setApiKey] = useState('');
  const { data: status } = useApiKeyStatus();
  const setApiKeyMutation = useSetApiKey();

  const handleSaveKey = (): void => {
    if (!apiKey.trim()) return;
    setApiKeyMutation.mutate(apiKey.trim(), {
      onSuccess: () => {
        // Also save the provider preference
        window.nswot.settings.set('llmProviderType', provider).catch((err: unknown) => {
          console.error('[api-key-step] Failed to save provider preference:', err);
        });
        window.nswot.llm.setProvider(provider).catch((err: unknown) => {
          console.error('[api-key-step] Failed to set provider:', err);
        });
        setApiKey('');
      },
    });
  };

  const keyIsConfigured = status?.isSet ?? false;
  const placeholder = provider === 'openrouter' ? 'sk-or-...' : 'sk-ant-...';

  return (
    <div className="mx-auto max-w-lg">
      <h2 className="mb-2 text-2xl font-bold text-white">Configure LLM Provider</h2>
      <p className="mb-6 text-sm text-gray-400">
        nswot uses an LLM to generate SWOT analyses. Choose your provider and enter your API key.
      </p>

      <div className="mb-6 space-y-3">
        <label className="mb-1 block text-sm font-medium text-gray-300">Provider</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setProvider('openrouter')}
            className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
              provider === 'openrouter'
                ? 'border-blue-500 bg-blue-900/20'
                : 'border-gray-700 bg-gray-900 hover:border-gray-600'
            }`}
          >
            <div className="text-sm font-medium text-white">OpenRouter</div>
            <div className="text-xs text-gray-400">Access many models through a unified API</div>
          </button>
          <button
            type="button"
            onClick={() => setProvider('anthropic')}
            className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
              provider === 'anthropic'
                ? 'border-blue-500 bg-blue-900/20'
                : 'border-gray-700 bg-gray-900 hover:border-gray-600'
            }`}
          >
            <div className="text-sm font-medium text-white">Anthropic</div>
            <div className="text-xs text-gray-400">Direct access to Claude models</div>
          </button>
        </div>
      </div>

      <div className="mb-4 space-y-2">
        <label className="block text-sm font-medium text-gray-300">API Key</label>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={placeholder}
            className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleSaveKey}
            disabled={!apiKey.trim() || setApiKeyMutation.isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {setApiKeyMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
        {setApiKeyMutation.isError && (
          <p className="text-sm text-red-400">
            {setApiKeyMutation.error instanceof Error
              ? setApiKeyMutation.error.message
              : 'Failed to save API key'}
          </p>
        )}
      </div>

      <div className="mb-6 flex items-center gap-2">
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

      <div className="flex items-center justify-between border-t border-gray-800 pt-4">
        <button
          onClick={onBack}
          className="rounded px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!keyIsConfigured}
          className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
