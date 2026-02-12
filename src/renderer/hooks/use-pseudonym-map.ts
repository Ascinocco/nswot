import { useQuery } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

export function usePseudonymMap(analysisId: string | null) {
  return useQuery({
    queryKey: ['pseudonymMap', analysisId] as const,
    queryFn: async () => {
      const result = await window.nswot.analysis.getPseudonymMap(analysisId!);
      return unwrapResult(result);
    },
    enabled: !!analysisId,
  });
}
