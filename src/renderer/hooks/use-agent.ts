import { useState, useEffect, useCallback } from 'react';

export type AgentState = 'idle' | 'thinking' | 'executing_tool' | 'awaiting_approval' | 'error';

export interface TokenCount {
  input: number;
  output: number;
}

export interface ContentBlock {
  type: string;
  id: string;
  data: unknown;
}

export function useAgentState(conversationId: string | null): AgentState {
  const [state, setState] = useState<AgentState>('idle');

  useEffect(() => {
    const cleanup = window.nswot.agent.onState((data) => {
      if (!conversationId || data.conversationId === conversationId) {
        setState(data.state as AgentState);
      }
    });
    return cleanup;
  }, [conversationId]);

  return state;
}

export function useTokenCount(conversationId: string | null): TokenCount {
  const [tokens, setTokens] = useState<TokenCount>({ input: 0, output: 0 });

  useEffect(() => {
    const cleanup = window.nswot.agent.onTokenCount((data) => {
      if (!conversationId || data.conversationId === conversationId) {
        setTokens({ input: data.inputTokens, output: data.outputTokens });
      }
    });
    return cleanup;
  }, [conversationId]);

  return tokens;
}

export function useAgentBlocks(conversationId: string | null): ContentBlock[] {
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);

  useEffect(() => {
    setBlocks([]);
  }, [conversationId]);

  // Clear blocks when agent transitions to a new turn (state event received)
  useEffect(() => {
    if (!conversationId) return;
    const cleanup = window.nswot.agent.onState((data) => {
      if (data.conversationId === conversationId && data.state === 'thinking') {
        // New turn starting — clear blocks from previous turn
        setBlocks([]);
      }
    });
    return cleanup;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const cleanup = window.nswot.agent.onBlock((data) => {
      if (data.conversationId === conversationId) {
        setBlocks((prev) => [...prev, data.block as ContentBlock]);
      }
    });
    return cleanup;
  }, [conversationId]);

  return blocks;
}

export function useAgentThinking(conversationId: string | null): string | null {
  const [thinking, setThinking] = useState<string | null>(null);

  // Clear thinking when agent goes idle
  useEffect(() => {
    if (!conversationId) return;
    const cleanup = window.nswot.agent.onState((data) => {
      if (data.conversationId === conversationId && data.state === 'idle') {
        setThinking(null);
      }
    });
    return cleanup;
  }, [conversationId]);

  useEffect(() => {
    const cleanup = window.nswot.agent.onThinking((data) => {
      if (!conversationId || data.conversationId === conversationId) {
        setThinking(data.thinking);
      }
    });
    return cleanup;
  }, [conversationId]);

  return thinking;
}

export interface ToolActivity {
  toolName: string;
  status: 'started' | 'completed' | 'error';
  message?: string;
}

export function useToolActivity(conversationId: string | null): ToolActivity | null {
  const [activity, setActivity] = useState<ToolActivity | null>(null);

  useEffect(() => {
    const cleanup = window.nswot.agent.onToolActivity((data) => {
      if (!conversationId || data.conversationId === conversationId) {
        if (data.status === 'started') {
          setActivity({ toolName: data.toolName, status: data.status, message: data.message });
        } else {
          setActivity(null);
        }
      }
    });
    return cleanup;
  }, [conversationId]);

  return activity;
}

export function useStopAgent(): () => void {
  return useCallback(() => {
    window.nswot.agent.interrupt();
  }, []);
}
