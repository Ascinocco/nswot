import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

const ONBOARDING_KEY = ['onboardingStatus'] as const;

export function useOnboardingStatus() {
  return useQuery({
    queryKey: ONBOARDING_KEY,
    queryFn: async () => {
      const result = await window.nswot.settings.getAll();
      const prefs = unwrapResult(result);
      return prefs['onboardingComplete'] === 'true';
    },
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await window.nswot.settings.set('onboardingComplete', 'true');
      unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ONBOARDING_KEY });
    },
  });
}
