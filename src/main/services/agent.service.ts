import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { LLMProvider } from '../providers/llm/llm-provider.interface';
import type { LlmToolCall } from '../providers/llm/llm.types';
import type { ToolRegistry, ToolCategory } from '../providers/agent-tools/tool-registry';
import type { ContentBlock } from '../domain/content-block.types';

// Re-export for consumers
export type { ContentBlock };

// --- Agent Types ---

export type AgentState = 'idle' | 'thinking' | 'executing_tool' | 'awaiting_approval' | 'error';

export interface AgentTurnCallbacks {
  /** Fires on each text delta for real-time streaming. */
  onChunk?: (chunk: string) => void;
  /** Fires when thinking text is captured from the LLM response. */
  onThinking?: (thinking: string) => void;
  /** Fires when a content block is produced by a render tool. */
  onBlock?: (block: ContentBlock) => void;
  /** Fires when agent state changes. */
  onStateChange?: (state: AgentState) => void;
  /** Fires when a write tool needs approval. Resolves with true (approved) or false (rejected). */
  onApprovalRequest?: (toolName: string, toolInput: Record<string, unknown>) => Promise<boolean>;
  /** Fires with accumulated token counts. */
  onTokenCount?: (input: number, output: number) => void;
  /** Fires when a tool starts or completes execution. */
  onToolActivity?: (toolName: string, status: 'started' | 'completed' | 'error', message?: string) => void;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface AgentTurnResult {
  /** Final text content from the agent (may be empty if only tool calls). */
  content: string;
  /** Content blocks produced during this turn (from render tools + thinking). */
  blocks: ContentBlock[];
  /** Whether the turn was interrupted by the user. */
  interrupted: boolean;
  /** Total input tokens consumed across all LLM calls in this turn. */
  inputTokens: number;
  /** Total output tokens consumed across all LLM calls in this turn. */
  outputTokens: number;
}

interface ToolExecutionResult {
  toolCallId: string;
  content: string;
}

/** Maximum number of agentic loop iterations to prevent infinite loops. */
const MAX_LOOP_ITERATIONS = 25;

/**
 * Agent harness: multi-turn execution loop for chat-driven agent experience.
 *
 * The agent sends messages to the LLM, handles tool calls (render/read/write),
 * captures thinking blocks, supports interrupts, and loops until the LLM
 * produces a final response with no pending tool calls.
 */
export class AgentService {
  private abortController: AbortController | null = null;

  constructor(
    private readonly llmProvider: LLMProvider,
    private readonly toolRegistry: ToolRegistry,
    private readonly toolExecutor: ToolExecutorInterface,
  ) {}

  /**
   * Execute a single agent turn: send messages to LLM, handle tool calls in a loop,
   * and return the final result with all content blocks produced.
   */
  async executeTurn(
    apiKey: string,
    modelId: string,
    messages: AgentMessage[],
    callbacks: AgentTurnCallbacks = {},
  ): Promise<Result<AgentTurnResult, DomainError>> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const blocks: ContentBlock[] = [];
    let finalContent = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let outputTokensEstimated = 0;
    let interrupted = false;

    try {
      callbacks.onStateChange?.('thinking');

      // Get all tool definitions for the LLM request
      const tools = this.toolRegistry.getAllDefinitions();

      // Mutable copy of messages — we append tool results as we loop
      const conversationMessages = [...messages];

      for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration++) {
        if (signal.aborted) {
          interrupted = true;
          break;
        }

        // Call LLM
        const response = await this.llmProvider.createChatCompletion({
          apiKey,
          modelId,
          messages: conversationMessages,
          tools: tools.length > 0 ? (tools as unknown[]) : undefined,
          onChunk: callbacks.onChunk,
          onToken: (count) => {
            outputTokensEstimated += count;
            callbacks.onTokenCount?.(inputTokens, outputTokensEstimated);
          },
        });

        // Accumulate token usage from response (if provider reports it)
        if (response.usage) {
          inputTokens += response.usage.inputTokens;
          outputTokens += response.usage.outputTokens;
          outputTokensEstimated = outputTokens;
        }
        callbacks.onTokenCount?.(inputTokens, outputTokens);

        if (signal.aborted) {
          interrupted = true;
          finalContent += response.content;
          break;
        }

        // Extract thinking from response content
        const { thinking, cleanContent } = extractThinking(response.content);
        if (thinking) {
          const thinkingBlock: ContentBlock = {
            type: 'thinking',
            id: generateBlockId(),
            data: { thinking },
          };
          blocks.push(thinkingBlock);
          callbacks.onThinking?.(thinking);
          callbacks.onBlock?.(thinkingBlock);
        }

        // If no tool calls, this is the final response
        if (!response.toolCalls || response.toolCalls.length === 0) {
          finalContent += cleanContent;
          break;
        }

        // Accumulate text from iterations that also have tool calls
        if (cleanContent) {
          finalContent += cleanContent;
        }

        // Process tool calls
        callbacks.onStateChange?.('executing_tool');

        // Build the assistant message with tool_calls
        const assistantMessage: AgentMessage = {
          role: 'assistant',
          tool_calls: response.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        };
        if (cleanContent) {
          assistantMessage.content = cleanContent;
        }
        conversationMessages.push(assistantMessage);

        // Execute each tool call
        const toolResults = await this.executeToolCalls(
          response.toolCalls,
          blocks,
          callbacks,
          signal,
        );

        if (signal.aborted) {
          interrupted = true;
          finalContent += cleanContent;
          break;
        }

        // Append tool results to conversation
        for (const result of toolResults) {
          conversationMessages.push({
            role: 'tool',
            tool_call_id: result.toolCallId,
            content: result.content,
          });
        }

        // Loop continues — LLM will process tool results
        callbacks.onStateChange?.('thinking');
      }

      callbacks.onStateChange?.('idle');
      callbacks.onTokenCount?.(inputTokens, outputTokens);

      return ok({
        content: finalContent,
        blocks,
        interrupted,
        inputTokens,
        outputTokens,
      });
    } catch (cause) {
      callbacks.onStateChange?.('error');

      if (signal.aborted) {
        return ok({
          content: finalContent,
          blocks,
          interrupted: true,
          inputTokens,
          outputTokens,
        });
      }

      if (cause instanceof DomainError) {
        return err(cause);
      }
      return err(
        new DomainError(ERROR_CODES.LLM_REQUEST_FAILED, 'Agent turn failed', cause),
      );
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Interrupt the current agent turn. Cancels in-flight LLM requests
   * and skips pending tool calls.
   */
  interrupt(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /** Whether the agent is currently executing a turn. */
  get isRunning(): boolean {
    return this.abortController !== null;
  }

  private async executeToolCalls(
    toolCalls: LlmToolCall[],
    blocks: ContentBlock[],
    callbacks: AgentTurnCallbacks,
    signal: AbortSignal,
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];

    for (const tc of toolCalls) {
      if (signal.aborted) break;

      let toolInput: Record<string, unknown>;
      try {
        toolInput = JSON.parse(tc.arguments) as Record<string, unknown>;
      } catch {
        results.push({
          toolCallId: tc.id,
          content: JSON.stringify({ error: 'Invalid tool arguments: failed to parse JSON' }),
        });
        continue;
      }

      const category = this.toolRegistry.getCategory(tc.name);
      if (!category) {
        results.push({
          toolCallId: tc.id,
          content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
        });
        continue;
      }

      // Write tools require approval
      if (category === 'write') {
        const approved = await this.handleApproval(tc.name, toolInput, callbacks, signal);
        if (signal.aborted) break;
        if (!approved) {
          results.push({
            toolCallId: tc.id,
            content: 'User declined this action. Do not retry. Continue the conversation without performing it.',
          });
          continue;
        }
      }

      // Execute the tool
      callbacks.onToolActivity?.(tc.name, 'started');
      let result: ToolExecutionOutput;
      try {
        result = await this.toolExecutor.execute(tc.name, category, toolInput);
        callbacks.onToolActivity?.(tc.name, 'completed');
      } catch (toolError) {
        callbacks.onToolActivity?.(tc.name, 'error', toolError instanceof Error ? toolError.message : 'Unknown error');
        results.push({
          toolCallId: tc.id,
          content: JSON.stringify({ error: toolError instanceof Error ? toolError.message : 'Tool execution failed' }),
        });
        continue;
      }

      // If it's a render tool, capture the content block
      if (category === 'render' && result.block) {
        blocks.push(result.block);
        callbacks.onBlock?.(result.block);
        // Return compact confirmation (not the full data — saves context window)
        results.push({
          toolCallId: tc.id,
          content: JSON.stringify({ rendered: result.block.type, blockId: result.block.id }),
        });
      } else {
        results.push({
          toolCallId: tc.id,
          content: result.content ?? JSON.stringify({ error: 'No result' }),
        });
      }
    }

    return results;
  }

  private async handleApproval(
    toolName: string,
    toolInput: Record<string, unknown>,
    callbacks: AgentTurnCallbacks,
    signal: AbortSignal,
  ): Promise<boolean> {
    if (!callbacks.onApprovalRequest) {
      // No approval callback — auto-reject for safety
      return false;
    }

    callbacks.onStateChange?.('awaiting_approval');

    const approved = await callbacks.onApprovalRequest(toolName, toolInput);

    if (!signal.aborted) {
      callbacks.onStateChange?.('executing_tool');
    }

    return approved;
  }
}

// --- Tool Executor Interface ---

export interface ToolExecutionOutput {
  /** For render tools: the content block produced. */
  block?: ContentBlock;
  /** For read/write tools: the text result to feed back to the LLM. */
  content?: string;
}

/**
 * Interface for executing tools by name.
 * Implementations are wired up in later sprints (render-executor, read-executor, write-executor).
 * For Sprint 36, the agent harness uses this interface with mocks.
 */
export interface ToolExecutorInterface {
  execute(
    toolName: string,
    category: ToolCategory,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionOutput>;
}

// --- Utilities ---

let blockIdCounter = 0;

export function generateBlockId(): string {
  blockIdCounter += 1;
  return `block-${Date.now()}-${blockIdCounter}`;
}

/** Reset the block ID counter (for testing). */
export function resetBlockIdCounter(): void {
  blockIdCounter = 0;
}

/**
 * Extract thinking content from LLM response.
 *
 * Anthropic's extended thinking returns thinking blocks as part of the response.
 * The Anthropic provider may embed thinking in the content with markers,
 * or the LlmResponse type may be extended to carry thinking separately.
 *
 * For Sprint 36, we support a simple convention:
 * - If content starts with `<thinking>...</thinking>`, extract it.
 * - Otherwise, return the content as-is.
 *
 * This will be refined when thinking is surfaced natively through the LLM provider.
 */
export function extractThinking(content: string): {
  thinking: string | null;
  cleanContent: string;
} {
  const thinkingRegex = /^<thinking>([\s\S]*?)<\/thinking>\s*/;
  const match = content.match(thinkingRegex);

  if (match) {
    return {
      thinking: match[1]!.trim(),
      cleanContent: content.slice(match[0].length),
    };
  }

  return { thinking: null, cleanContent: content };
}
