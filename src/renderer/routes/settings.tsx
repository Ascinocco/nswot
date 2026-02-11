import ApiKeyInput from '../components/settings/api-key-input';
import ModelPicker from '../components/settings/model-picker';

export default function SettingsPage(): React.JSX.Element {
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Settings</h2>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-200">OpenRouter API Key</h3>
        <p className="text-sm text-gray-400">
          Enter your OpenRouter API key to enable LLM-powered analysis.
        </p>
        <ApiKeyInput />
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-200">Model</h3>
        <p className="text-sm text-gray-400">
          Choose which model to use for SWOT analysis generation.
        </p>
        <ModelPicker />
      </section>
    </div>
  );
}
