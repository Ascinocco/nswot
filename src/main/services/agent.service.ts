import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { LLMProvider } from '../providers/llm/llm-provider.interface';
import type { LlmToolCall } from '../providers/llm/llm.types';
import type { ToolRegistry, ToolCategory } from '../providers/agent-tools/tool-registry';
import type { ContentBlock } from '../domain/content-block.types';
import { Logger } from '../infrastructure/logger';

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

/** Default thinking token budget for models that support extended thinking. */
const DEFAULT_THINKING_BUDGET = 10000;

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
    thinkingBudget: number = DEFAULT_THINKING_BUDGET,
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
          thinkingBudget: thinkingBudget > 0 ? thinkingBudget : undefined,
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
          callbacks.onTokenCount?.(inputTokens, outputTokens);
        }
        // If no usage reported, keep the estimate — don't reset to 0

        if (signal.aborted) {
          interrupted = true;
          // Still extract thinking even on abort so partial thinking is captured
          const { thinking: abortThinking, cleanContent: abortClean } = extractThinking(
            response.content,
            response.thinking,
          );
          if (abortThinking) {
            const thinkingBlock: ContentBlock = {
              type: 'thinking',
              id: generateBlockId(),
              data: { thinking: abortThinking },
            };
            blocks.push(thinkingBlock);
            callbacks.onThinking?.(abortThinking);
            callbacks.onBlock?.(thinkingBlock);
          }
          finalContent += abortClean;
          break;
        }

        // Extract thinking from response (structured field or fallback regex)
        const { thinking, cleanContent } = extractThinking(response.content, response.thinking);
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
          // Push partial tool results + stubs for missing ones so conversation
          // history remains valid (every tool_call needs a matching tool result).
          const resultIds = new Set(toolResults.map((r) => r.toolCallId));
          for (const result of toolResults) {
            conversationMessages.push({
              role: 'tool',
              tool_call_id: result.toolCallId,
              content: result.content,
            });
          }
          for (const tc of response.toolCalls) {
            if (!resultIds.has(tc.id)) {
              conversationMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: '[Interrupted by user before this tool could execute.]',
              });
            }
          }
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

      // If we exhausted all iterations without a final response, treat as interrupted
      if (!interrupted && finalContent === '' && blocks.length === 0) {
        // Likely fell through the loop limit
        interrupted = true;
      }
      if (interrupted && !signal.aborted) {
        // Loop limit reached (not user-initiated abort)
        Logger.tryGetInstance()?.warn('Agent loop reached MAX_LOOP_ITERATIONS', {
          maxIterations: MAX_LOOP_ITERATIONS,
        });
        finalContent += '\n\n[Agent reached the maximum number of iterations and stopped. Some work may be incomplete.]';
      }

      callbacks.onStateChange?.('idle');
      // Use outputTokensEstimated when provider didn't report final usage
      const finalOutputTokens = outputTokens > 0 ? outputTokens : outputTokensEstimated;
      callbacks.onTokenCount?.(inputTokens, finalOutputTokens);

      return ok({
        content: finalContent,
        blocks,
        interrupted,
        inputTokens,
        outputTokens: finalOutputTokens,
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
        const errorMessage = toolError instanceof Error ? toolError.message : 'Tool execution failed';
        Logger.getInstance().error('Tool execution failed', {
          toolName: tc.name,
          category,
          error: errorMessage,
        });
        callbacks.onToolActivity?.(tc.name, 'error', errorMessage);
        results.push({
          toolCallId: tc.id,
          content: JSON.stringify({ error: errorMessage }),
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
 * Extract thinking content from an LLM response.
 *
 * Anthropic's extended thinking returns thinking as a structured field on the
 * response (populated by the Anthropic provider from `thinking_delta` SSE events).
 * If no structured thinking is present, falls back to regex extraction of
 * `<thinking>...</thinking>` tags for providers that embed thinking in text.
 */
export function extractThinking(
  content: string,
  structuredThinking?: string,
): {
  thinking: string | null;
  cleanContent: string;
} {
  // Prefer structured thinking from the provider (Anthropic extended thinking)
  if (structuredThinking) {
    return {
      thinking: structuredThinking,
      cleanContent: content,
    };
  }

  // Fallback: regex extraction for providers that embed thinking in XML tags
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
