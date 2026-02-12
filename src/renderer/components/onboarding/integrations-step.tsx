interface IntegrationsStepProps {
  onNext: () => void;
  onBack: () => void;
}

const INTEGRATIONS = [
  {
    name: 'Jira',
    description: 'Import project data, sprint metrics, and issue signals for SWOT evidence.',
    icon: 'J',
    color: 'text-blue-400 bg-blue-900/40',
  },
  {
    name: 'Confluence',
    description: 'Pull in documentation, design docs, and team knowledge for analysis.',
    icon: 'C',
    color: 'text-green-400 bg-green-900/40',
  },
  {
    name: 'GitHub',
    description: 'Analyze pull requests, issues, and contribution patterns.',
    icon: 'G',
    color: 'text-purple-400 bg-purple-900/40',
  },
  {
    name: 'Codebase',
    description: 'Deep code analysis for architecture, tech debt, and quality signals.',
    icon: 'CB',
    color: 'text-amber-400 bg-amber-900/40',
  },
] as const;

export default function IntegrationsStep({
  onNext,
  onBack,
}: IntegrationsStepProps): React.JSX.Element {
  return (
    <div className="mx-auto max-w-lg">
      <h2 className="mb-2 text-2xl font-bold text-white">Data Integrations</h2>
      <p className="mb-6 text-sm text-gray-400">
        nswot supports multiple data sources to enrich your SWOT analyses. You can set these up
        later from the Integrations page.
      </p>

      <div className="mb-6 space-y-3">
        {INTEGRATIONS.map((integration) => (
          <div
            key={integration.name}
            className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4"
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-bold ${integration.color}`}
            >
              {integration.icon}
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">{integration.name}</h3>
              <p className="text-xs text-gray-400">{integration.description}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mb-6 text-center text-xs text-gray-500">
        You can configure integrations at any time from Settings &rarr; Integrations.
      </p>

      <div className="flex items-center justify-between border-t border-gray-800 pt-4">
        <button
          onClick={onBack}
          className="rounded px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          Next
        </button>
      </div>
    </div>
  );
}
