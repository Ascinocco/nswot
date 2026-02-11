import { useMutation } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

export function useExportMarkdown() {
  return useMutation({
    mutationFn: async (analysisId: string) => {
      const result = await window.nswot.export.markdown(analysisId);
      return unwrapResult(result);
    },
  });
}
