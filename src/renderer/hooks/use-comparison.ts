import { useQuery, useMutation } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

const QUERY_KEYS = {
  comparisonList: ['comparison', 'list'] as const,
  comparisonRun: (idA: string, idB: string) => ['comparison', 'run', idA, idB] as const,
};

export function useComparisonAnalyses(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.comparisonList,
    queryFn: async () => {
      const result = await window.nswot.comparison.list();
      return unwrapResult(result);
    },
    enabled,
  });
}

export function useRunComparison() {
  return useMutation({
    mutationFn: async ({ analysisIdA, analysisIdB }: { analysisIdA: string; analysisIdB: string }) => {
      const result = await window.nswot.comparison.run(analysisIdA, analysisIdB);
      return unwrapResult(result);
    },
  });
}
