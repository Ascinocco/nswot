import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

const QUERY_KEYS = {
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversations', id] as const,
};

export function useConversations() {
  return useQuery({
    queryKey: QUERY_KEYS.conversations,
    queryFn: async () => {
      const result = await window.nswot.conversations.list();
      return unwrapResult(result);
    },
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.conversation(id ?? ''),
    queryFn: async () => {
      const result = await window.nswot.conversations.get(id!);
      return unwrapResult(result);
    },
    enabled: !!id,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (role: string) => {
      const result = await window.nswot.conversations.create(role);
      return unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
    },
  });
}

export function useUpdateConversationTitle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const result = await window.nswot.conversations.updateTitle(id, title);
      unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await window.nswot.conversations.delete(id);
      unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
    },
  });
}
