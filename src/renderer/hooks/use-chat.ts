import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrapResult } from '../lib/ipc-error';

const QUERY_KEYS = {
  messages: (analysisId: string) => ['chat', analysisId] as const,
  actions: (analysisId: string) => ['chat-actions', analysisId] as const,
};

export function useChatMessages(analysisId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.messages(analysisId ?? ''),
    queryFn: async () => {
      const result = await window.nswot.chat.getMessages(analysisId!);
      return unwrapResult(result);
    },
    enabled: !!analysisId,
  });
}

export function useSendMessage(analysisId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const result = await window.nswot.chat.send(analysisId, content);
      return unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(analysisId) });
    },
  });
}

export function useDeleteChat(analysisId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await window.nswot.chat.delete(analysisId);
      unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(analysisId) });
    },
  });
}

export function useChatActions(analysisId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.actions(analysisId ?? ''),
    queryFn: async () => {
      const result = await window.nswot.chat.actions.list(analysisId!);
      return unwrapResult(result);
    },
    enabled: !!analysisId,
  });
}

export function useApproveAction(analysisId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (actionId: string) => {
      const result = await window.nswot.chat.actions.approve(analysisId, actionId);
      return unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.actions(analysisId) });
    },
  });
}

export function useEditAction(analysisId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ actionId, editedInput }: { actionId: string; editedInput: Record<string, unknown> }) => {
      const result = await window.nswot.chat.actions.edit(actionId, editedInput);
      unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.actions(analysisId) });
    },
  });
}

export function useRejectAction(analysisId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (actionId: string) => {
      const result = await window.nswot.chat.actions.reject(analysisId, actionId);
      unwrapResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.actions(analysisId) });
    },
  });
}
