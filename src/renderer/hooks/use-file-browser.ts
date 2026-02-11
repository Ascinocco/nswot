import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

const QUERY_KEYS = {
  directory: (path: string) => ['directory', path] as const,
  fileContent: (path: string) => ['fileContent', path] as const,
};

export function useDirectory(path: string) {
  return useQuery({
    queryKey: QUERY_KEYS.directory(path),
    queryFn: async () => {
      const result = await window.nswot.file.readDir(path);
      return unwrapResult(result);
    },
  });
}

export function useFileContent(filePath: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.fileContent(filePath ?? ''),
    queryFn: async () => {
      const result = await window.nswot.file.read(filePath!);
      return unwrapResult(result);
    },
    enabled: !!filePath,
  });
}

export function useSaveFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const result = await window.nswot.file.write(path, content);
      unwrapResult(result);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.fileContent(variables.path) });
    },
  });
}
