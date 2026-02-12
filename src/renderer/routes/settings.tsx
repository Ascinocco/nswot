import ProviderPicker from '../components/settings/provider-picker';

export default function SettingsPage(): React.JSX.Element {
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Settings</h2>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-200">LLM Provider &amp; API Key</h3>
        <p className="text-sm text-gray-400">
          Choose your LLM provider and configure your API key to enable analysis.
        </p>
        <ProviderPicker />
      </section>
    </div>
  );
}
