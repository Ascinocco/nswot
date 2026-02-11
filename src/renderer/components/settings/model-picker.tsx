import { useApiKeyStatus, useModels, useSelectedModel, useSetPreference } from '../../hooks/use-settings';

export default function ModelPicker(): React.JSX.Element {
  const { data: status } = useApiKeyStatus();
  const { data: models, isLoading, isError, error } = useModels(status?.isSet ?? false);
  const selectedModelId = useSelectedModel();
  const setPreference = useSetPreference();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setPreference.mutate({ key: 'selectedModelId', value: e.target.value });
  };

  if (!status?.isSet) {
    return (
      <p className="text-sm text-gray-500">
        Configure your API key above to select a model.
      </p>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading models...</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-red-400">
        {error instanceof Error ? error.message : 'Failed to load models'}
      </p>
    );
  }

  if (!models || models.length === 0) {
    return <p className="text-sm text-gray-500">No models available.</p>;
  }

  return (
    <div className="space-y-2">
      <select
        value={selectedModelId ?? ''}
        onChange={handleChange}
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
      {selectedModelId && (
        <p className="text-xs text-gray-500">
          Selected: {selectedModelId}
        </p>
      )}
    </div>
  );
}
