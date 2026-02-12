import { useApiKeyStatus } from '../../hooks/use-settings';
import { useCompleteOnboarding } from '../../hooks/use-onboarding';

interface CompletionStepProps {
  onComplete: () => void;
  onBack: () => void;
}

export default function CompletionStep({
  onComplete,
  onBack,
}: CompletionStepProps): React.JSX.Element {
  const { data: keyStatus } = useApiKeyStatus();
  const completeOnboarding = useCompleteOnboarding();

  const handleComplete = (): void => {
    completeOnboarding.mutate(undefined, {
      onSuccess: () => onComplete(),
    });
  };

  return (
    <div className="mx-auto max-w-lg text-center">
      <h2 className="mb-3 text-2xl font-bold text-white">You&apos;re All Set!</h2>
      <p className="mb-6 text-sm text-gray-400">
        Here&apos;s a summary of your setup. You can change these settings at any time.
      </p>

      <div className="mb-8 space-y-3 text-left">
        <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
          <span className="text-sm text-gray-300">API Key</span>
          {keyStatus?.isSet ? (
            <span className="rounded bg-green-900/50 px-2 py-0.5 text-xs text-green-400">
              Configured
            </span>
          ) : (
            <span className="rounded bg-yellow-900/50 px-2 py-0.5 text-xs text-yellow-400">
              Not configured
            </span>
          )}
        </div>
        <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
          <span className="text-sm text-gray-300">Integrations</span>
          <span className="text-xs text-gray-500">Set up later in Integrations</span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-gray-800 pt-4">
        <button
          onClick={onBack}
          className="rounded px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white"
        >
          Back
        </button>
        <button
          onClick={handleComplete}
          disabled={completeOnboarding.isPending}
          className="rounded bg-blue-600 px-8 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {completeOnboarding.isPending ? 'Starting...' : 'Start Using nswot'}
        </button>
      </div>
    </div>
  );
}
