import { useMutation } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

export type ExportFormat = 'markdown' | 'csv' | 'pdf';

export function useExportMarkdown() {
  return useMutation({
    mutationFn: async (analysisId: string) => {
      const result = await window.nswot.export.markdown(analysisId);
      return unwrapResult(result);
    },
  });
}

export function useExportCSV() {
  return useMutation({
    mutationFn: async (analysisId: string) => {
      const result = await window.nswot.export.csv(analysisId);
      return unwrapResult(result);
    },
  });
}

export function useExportPDF() {
  return useMutation({
    mutationFn: async (analysisId: string) => {
      const result = await window.nswot.export.pdf(analysisId);
      return unwrapResult(result);
    },
  });
}
