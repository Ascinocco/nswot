import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

const QUERY_KEYS = {
  analyses: ['analyses'] as const,
  analysis: (id: string) => ['analyses', id] as const,
};

export function useAnalyses(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.analyses,
    queryFn: async () => {
      const result = await window.nswot.analysis.list();
      return unwrapResult(result);
    },
    enabled,
  });
}

export function useAnalysis(id: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.analysis(id ?? ''),
    queryFn: async () => {
      const result = await window.nswot.analysis.get(id!);
      return unwrapResult(result);
    },
    enabled: !!id,
  });
}

export function useDeleteAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await window.nswot.analysis.delete(id);
      unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.analyses });
    },
  });
}
