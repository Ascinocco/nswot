import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

const QUERY_KEYS = {
  preferences: ['preferences'] as const,
  apiKeyStatus: ['apiKeyStatus'] as const,
  models: ['models'] as const,
};

export function usePreferences() {
  return useQuery({
    queryKey: QUERY_KEYS.preferences,
    queryFn: async () => {
      const result = await window.nswot.settings.getAll();
      return unwrapResult(result);
    },
  });
}

export function useSetPreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const result = await window.nswot.settings.set(key, value);
      unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.preferences });
    },
  });
}

export function useApiKeyStatus() {
  return useQuery({
    queryKey: QUERY_KEYS.apiKeyStatus,
    queryFn: async () => {
      const result = await window.nswot.settings.getApiKeyStatus();
      return unwrapResult(result);
    },
  });
}

export function useSetApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (apiKey: string) => {
      const result = await window.nswot.settings.setApiKey(apiKey);
      unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.apiKeyStatus });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.models });
    },
  });
}

export function useModels(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.models,
    queryFn: async () => {
      const result = await window.nswot.llm.listModels();
      return unwrapResult(result);
    },
    enabled,
  });
}

export function useSelectedModel() {
  const { data: preferences } = usePreferences();
  return preferences?.['selectedModelId'] ?? null;
}
