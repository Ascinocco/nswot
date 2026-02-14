import { useState, useEffect, useCallback, useRef } from 'react';
import { CONTENT_BLOCK_TYPES } from '../../main/domain/content-block.types';
import type { ContentBlock } from '../../main/domain/content-block.types';

// AgentState is defined globally in env.d.ts — re-export for consumers
export type { AgentState };

export interface TokenCount {
  input: number;
  output: number;
}

// Re-export the real discriminated union from domain — never redefine locally
export type { ContentBlock } from '../../main/domain/content-block.types';

/** A frozen segment: either text or a content block, in arrival order. */
export type StreamSegment =
  | { type: 'text'; content: string }
  | { type: 'block'; block: ContentBlock };

const VALID_BLOCK_TYPES = new Set<string>(CONTENT_BLOCK_TYPES);

/** Validate that an IPC payload looks like a ContentBlock before accepting it. */
export function isValidBlock(value: unknown): value is ContentBlock {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.type === 'string' &&
    VALID_BLOCK_TYPES.has(obj.type) &&
    typeof obj.id === 'string' &&
    obj.data !== undefined
  );
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

export function useAgentBlocks(conversationId: string | null): {
  blocks: ContentBlock[];
  clearBlocks: () => void;
} {
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const prevStateRef = useRef<string>('idle');

  useEffect(() => {
    setBlocks([]);
    prevStateRef.current = 'idle';
  }, [conversationId]);

  // Clear blocks only when a NEW turn starts (idle → thinking),
  // not during mid-loop iterations (executing_tool → thinking).
  useEffect(() => {
    if (!conversationId) return;
    const cleanup = window.nswot.agent.onState((data) => {
      if (data.conversationId === conversationId) {
        if (data.state === 'thinking' && prevStateRef.current === 'idle') {
          setBlocks([]);
        }
        prevStateRef.current = data.state as string;
      }
    });
    return cleanup;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const cleanup = window.nswot.agent.onBlock((data) => {
      if (data.conversationId === conversationId) {
        if (isValidBlock(data.block)) {
          setBlocks((prev) => [...prev, data.block as ContentBlock]);
        } else {
          console.warn('[use-agent] Received invalid block from IPC, skipping:', data.block);
        }
      }
    });
    return cleanup;
  }, [conversationId]);

  const clearBlocks = useCallback(() => {
    setBlocks([]);
  }, []);

  return { blocks, clearBlocks };
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

/**
 * Tracks interleaved text + block segments in arrival order during streaming.
 *
 * When text chunks arrive, they accumulate in `activeText`.
 * When a block arrives, the current `activeText` is frozen into a text segment,
 * the block is added as a block segment, and `activeText` resets.
 * This preserves the natural ordering so blocks appear inline where produced.
 */
export function useStreamSegments(
  conversationId: string | null,
  analysisIds: string[],
): {
  /** Frozen segments (text and blocks) in arrival order. */
  segments: StreamSegment[];
  /** Currently streaming text (not yet frozen). Renders after all segments. */
  activeText: string;
  /** All blocks extracted from segments (for finalization into messages). */
  allBlocks: ContentBlock[];
  /** Clear everything (on turn completion or new turn). */
  clear: () => void;
} {
  const [segments, setSegments] = useState<StreamSegment[]>([]);
  const [activeText, setActiveText] = useState('');
  const activeTextRef = useRef('');
  const analysisIdsRef = useRef(analysisIds);
  analysisIdsRef.current = analysisIds;

  // Clear on new turn start (idle → thinking)
  const prevStateRef = useRef<string>('idle');
  useEffect(() => {
    if (!conversationId) return;
    const cleanup = window.nswot.agent.onState((data) => {
      if (data.conversationId === conversationId) {
        if (data.state === 'thinking' && prevStateRef.current === 'idle') {
          setSegments([]);
          setActiveText('');
          activeTextRef.current = '';
        }
        prevStateRef.current = data.state as string;
      }
    });
    return cleanup;
  }, [conversationId]);

  // Reset when conversation changes
  useEffect(() => {
    setSegments([]);
    setActiveText('');
    activeTextRef.current = '';
    prevStateRef.current = 'idle';
  }, [conversationId]);

  // Listen for text chunks
  useEffect(() => {
    const cleanup = window.nswot.chat.onChunk((data) => {
      const ids = analysisIdsRef.current;
      if (ids.length === 0 || ids.includes(data.analysisId)) {
        setActiveText((prev) => {
          const next = prev + data.chunk;
          activeTextRef.current = next;
          return next;
        });
      }
    });
    return cleanup;
  }, []); // analysisIds tracked via ref to avoid re-subscribing

  // Listen for blocks — freeze current text, add block, reset active text
  useEffect(() => {
    if (!conversationId) return;
    const cleanup = window.nswot.agent.onBlock((data) => {
      if (data.conversationId === conversationId && isValidBlock(data.block)) {
        setSegments((prev) => {
          const next = [...prev];
          // Freeze current active text as a segment if non-empty
          if (activeTextRef.current) {
            next.push({ type: 'text', content: activeTextRef.current });
          }
          next.push({ type: 'block', block: data.block as ContentBlock });
          return next;
        });
        setActiveText('');
        activeTextRef.current = '';
      }
    });
    return cleanup;
  }, [conversationId]);

  const clear = useCallback(() => {
    setSegments([]);
    setActiveText('');
    activeTextRef.current = '';
  }, []);

  // Extract all blocks for finalization
  const allBlocks = segments
    .filter((s): s is StreamSegment & { type: 'block' } => s.type === 'block')
    .map((s) => s.block);

  return { segments, activeText, allBlocks, clear };
}
