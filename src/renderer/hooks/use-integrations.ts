import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

const QUERY_KEYS = {
  integration: ['integration'] as const,
  jiraProjects: ['jiraProjects'] as const,
};

export function useIntegration() {
  return useQuery({
    queryKey: QUERY_KEYS.integration,
    queryFn: async () => {
      const result = await window.nswot.integrations.get();
      return unwrapResult(result);
    },
  });
}

export function useConnectJira() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, clientSecret }: { clientId: string; clientSecret: string }) => {
      const result = await window.nswot.integrations.connectJira(clientId, clientSecret);
      return unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.integration });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.jiraProjects });
    },
  });
}

export function useDisconnectJira() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await window.nswot.integrations.disconnect();
      unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.integration });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.jiraProjects });
    },
  });
}

export function useJiraProjects(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.jiraProjects,
    queryFn: async () => {
      const result = await window.nswot.integrations.listProjects();
      return unwrapResult(result);
    },
    enabled,
  });
}

export function useSyncJira() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectKeys: string[]) => {
      const result = await window.nswot.integrations.sync(projectKeys);
      return unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.integration });
    },
  });
}
