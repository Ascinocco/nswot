import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

const QUERY_KEYS = {
  profiles: ['profiles'] as const,
  profile: (id: string) => ['profiles', id] as const,
};

export function useProfiles(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.profiles,
    queryFn: async () => {
      const result = await window.nswot.profiles.list();
      return unwrapResult(result);
    },
    enabled,
  });
}

export function useProfile(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.profile(id),
    queryFn: async () => {
      const result = await window.nswot.profiles.get(id);
      return unwrapResult(result);
    },
    enabled: !!id,
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProfileInput) => {
      const result = await window.nswot.profiles.create(input);
      return unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profiles });
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ProfileInput }) => {
      const result = await window.nswot.profiles.update(id, input);
      return unwrapResult(result);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profiles });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profile(variables.id) });
    },
  });
}

export function useDeleteProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await window.nswot.profiles.delete(id);
      unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profiles });
    },
  });
}

export function useImportProfiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (filePath: string) => {
      const result = await window.nswot.profiles.importMarkdown(filePath);
      return unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profiles });
    },
  });
}

export function useImportDirectory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dirPath: string) => {
      const result = await window.nswot.profiles.importDirectory(dirPath);
      return unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profiles });
    },
  });
}
