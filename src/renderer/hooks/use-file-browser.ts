import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

const QUERY_KEYS = {
  directory: (path: string) => ['directory', path] as const,
  fileContent: (path: string) => ['fileContent', path] as const,
};

export function useDirectory(path: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.directory(path),
    queryFn: async () => {
      const result = await window.nswot.file.readDir(path);
      return unwrapResult(result);
    },
    enabled,
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

export function useFileWatcher() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!window.nswot.file.onChanged) return;

    const cleanup = window.nswot.file.onChanged((data: { type: string; path: string }) => {
      // Invalidate the directory that contains the changed file
      const dirPath = data.path.substring(0, data.path.lastIndexOf('/')) || '.';
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.directory(dirPath) });
      // Also invalidate the file content if it's cached
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.fileContent(data.path) });
    });

    return cleanup;
  }, [queryClient]);
}
