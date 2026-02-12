interface WelcomeStepProps {
  onNext: () => void;
}

export default function WelcomeStep({ onNext }: WelcomeStepProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="mb-3 text-3xl font-bold text-white">Welcome to nswot</h2>
      <p className="mb-6 max-w-lg text-gray-400">
        Turn stakeholder interview notes and engineering signals into evidence-backed SWOT analyses.
        Connect your data sources, run an analysis, and get actionable insights grounded in real evidence.
      </p>
      <div className="mb-8 grid max-w-lg grid-cols-2 gap-4 text-left">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-1 text-sm font-semibold text-white">Stakeholder Profiles</h3>
          <p className="text-xs text-gray-400">
            Import interview notes and capture concerns, priorities, and direct quotes.
          </p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-1 text-sm font-semibold text-white">Multi-Source Evidence</h3>
          <p className="text-xs text-gray-400">
            Pull signals from Jira, Confluence, GitHub, and codebase analysis.
          </p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-1 text-sm font-semibold text-white">SWOT Analysis</h3>
          <p className="text-xs text-gray-400">
            AI-powered analysis with every claim backed by traceable evidence.
          </p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-1 text-sm font-semibold text-white">Local &amp; Private</h3>
          <p className="text-xs text-gray-400">
            All data stays on your machine. Names are anonymized before LLM calls.
          </p>
        </div>
      </div>
      <button
        onClick={onNext}
        className="rounded bg-blue-600 px-8 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
      >
        Get Started
      </button>
    </div>
  );
}
