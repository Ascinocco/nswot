import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

const QUERY_KEYS = {
  currentWorkspace: ['currentWorkspace'] as const,
};

export function useCurrentWorkspace() {
  return useQuery({
    queryKey: QUERY_KEYS.currentWorkspace,
    queryFn: async () => {
      const result = await window.nswot.workspace.getCurrent();
      return unwrapResult(result);
    },
  });
}

export function useOpenWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await window.nswot.workspace.open();
      return unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.currentWorkspace });
    },
  });
}
