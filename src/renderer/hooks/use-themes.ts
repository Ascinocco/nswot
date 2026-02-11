import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

const QUERY_KEYS = {
  themes: (analysisId: string) => ['themes', analysisId] as const,
};

export function useThemes(analysisId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.themes(analysisId ?? ''),
    queryFn: async () => {
      const result = await window.nswot.themes.list(analysisId!);
      return unwrapResult(result);
    },
    enabled: !!analysisId,
  });
}

export function useUpdateTheme(analysisId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      fields,
    }: {
      id: string;
      fields: { label?: string; description?: string };
    }) => {
      const result = await window.nswot.themes.update(id, fields);
      return unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.themes(analysisId) });
    },
  });
}

export function useDeleteTheme(analysisId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await window.nswot.themes.delete(id);
      return unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.themes(analysisId) });
    },
  });
}
