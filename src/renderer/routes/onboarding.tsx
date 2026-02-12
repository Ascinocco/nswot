import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WelcomeStep from '../components/onboarding/welcome-step';
import ApiKeyStep from '../components/onboarding/api-key-step';
import IntegrationsStep from '../components/onboarding/integrations-step';
import CompletionStep from '../components/onboarding/completion-step';

const STEPS = ['Welcome', 'API Key', 'Integrations', 'Complete'] as const;

export default function OnboardingPage(): React.JSX.Element {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const handleComplete = (): void => {
    navigate('/');
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center py-12">
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                i < step
                  ? 'bg-blue-600 text-white'
                  : i === step
                    ? 'border-2 border-blue-500 text-blue-400'
                    : 'border border-gray-700 text-gray-500'
              }`}
            >
              {i < step ? '\u2713' : i + 1}
            </div>
            <span
              className={`text-xs ${i === step ? 'text-white' : 'text-gray-500'}`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-8 ${i < step ? 'bg-blue-600' : 'bg-gray-700'}`} />
            )}
          </div>
        ))}
      </div>

      <div className="w-full max-w-2xl">
        {step === 0 && <WelcomeStep onNext={() => setStep(1)} />}
        {step === 1 && <ApiKeyStep onNext={() => setStep(2)} onBack={() => setStep(0)} />}
        {step === 2 && (
          <IntegrationsStep onNext={() => setStep(3)} onBack={() => setStep(1)} />
        )}
        {step === 3 && (
          <CompletionStep onComplete={handleComplete} onBack={() => setStep(2)} />
        )}
      </div>
    </div>
  );
}
