import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

const QUERY_KEYS = {
  integration: ['integration'] as const,
  jiraProjects: ['jiraProjects'] as const,
  confluenceIntegration: ['confluenceIntegration'] as const,
  confluenceSpaces: ['confluenceSpaces'] as const,
  githubIntegration: ['githubIntegration'] as const,
  githubRepos: ['githubRepos'] as const,
};

// --- Jira ---

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

// --- Confluence ---

export function useConfluenceIntegration() {
  return useQuery({
    queryKey: QUERY_KEYS.confluenceIntegration,
    queryFn: async () => {
      const result = await window.nswot.confluence.get();
      return unwrapResult(result);
    },
  });
}

export function useConnectConfluence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await window.nswot.confluence.connect();
      return unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.confluenceIntegration });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.confluenceSpaces });
    },
  });
}

export function useDisconnectConfluence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await window.nswot.confluence.disconnect();
      unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.confluenceIntegration });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.confluenceSpaces });
    },
  });
}

export function useConfluenceSpaces(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.confluenceSpaces,
    queryFn: async () => {
      const result = await window.nswot.confluence.listSpaces();
      return unwrapResult(result);
    },
    enabled,
  });
}

export function useSyncConfluence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (spaceKeys: string[]) => {
      const result = await window.nswot.confluence.sync(spaceKeys);
      return unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.confluenceIntegration });
    },
  });
}

// --- GitHub ---

export function useGitHubIntegration() {
  return useQuery({
    queryKey: QUERY_KEYS.githubIntegration,
    queryFn: async () => {
      const result = await window.nswot.github.get();
      return unwrapResult(result);
    },
  });
}

export function useConnectGitHub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pat: string) => {
      const result = await window.nswot.github.connect(pat);
      return unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.githubIntegration });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.githubRepos });
    },
  });
}

export function useDisconnectGitHub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await window.nswot.github.disconnect();
      unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.githubIntegration });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.githubRepos });
    },
  });
}

export function useGitHubRepos(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.githubRepos,
    queryFn: async () => {
      const result = await window.nswot.github.listRepos();
      return unwrapResult(result);
    },
    enabled,
  });
}

export function useSyncGitHub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (repos: string[]) => {
      const result = await window.nswot.github.sync(repos);
      return unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.githubIntegration });
    },
  });
}
