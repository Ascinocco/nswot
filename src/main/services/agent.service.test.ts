import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AgentService,
  extractThinking,
  resetBlockIdCounter,
} from './agent.service';
import type {
  AgentTurnCallbacks,
  AgentMessage,
  ToolExecutorInterface,
  ContentBlock,
} from './agent.service';
import { ToolRegistry } from '../providers/agent-tools/tool-registry';
import type { LLMProvider } from '../providers/llm/llm-provider.interface';
import type { LlmResponse, LlmCompletionRequest } from '../providers/llm/llm.types';
import type { ActionToolDefinition } from '../providers/actions/action-tools';

// --- Helpers ---

function makeTool(name: string): ActionToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description: `Tool: ${name}`,
      parameters: { type: 'object', properties: {}, required: [] },
    },
  };
}

function makeMockLlmProvider(responses: LlmResponse[]): LLMProvider {
  let callIndex = 0;
  return {
    name: 'mock',
    listModels: vi.fn().mockResolvedValue([]),
    createChatCompletion: vi.fn(async (request: LlmCompletionRequest) => {
      const response = responses[callIndex];
      if (!response) {
        throw new Error(`No mock response for call index ${callIndex}`);
      }
      callIndex++;
      // Simulate streaming by calling onChunk with the content
      if (request.onChunk && response.content) {
        request.onChunk(response.content);
      }
      return response;
    }),
  };
}

function makeMockToolExecutor(
  results: Record<string, { block?: ContentBlock; content?: string }>,
): ToolExecutorInterface {
  return {
    execute: vi.fn(async (toolName: string) => {
      return results[toolName] ?? { content: JSON.stringify({ error: 'Unknown tool' }) };
    }),
  };
}

const TEST_API_KEY = 'test-api-key';
const TEST_MODEL_ID = 'test-model';

const systemMessage: AgentMessage = { role: 'system', content: 'You are a test agent.' };
const userMessage: AgentMessage = { role: 'user', content: 'Hello' };

describe('AgentService', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    resetBlockIdCounter();
  });

  describe('executeTurn — simple text response', () => {
    it('returns content when LLM responds with text only', async () => {
      const provider = makeMockLlmProvider([
        { content: 'Hello! How can I help?', finishReason: 'stop' },
      ]);
      const executor = makeMockToolExecutor({});
      const agent = new AgentService(provider, registry, executor);

      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Hello! How can I help?');
        expect(result.value.blocks).toHaveLength(0);
        expect(result.value.interrupted).toBe(false);
      }
    });

    it('fires onChunk callback during streaming', async () => {
      const provider = makeMockLlmProvider([
        { content: 'Streamed text', finishReason: 'stop' },
      ]);
      const executor = makeMockToolExecutor({});
      const agent = new AgentService(provider, registry, executor);

      const chunks: string[] = [];
      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
        { onChunk: (c) => chunks.push(c) },
      );

      expect(result.ok).toBe(true);
      expect(chunks).toContain('Streamed text');
    });

    it('fires onStateChange callbacks', async () => {
      const provider = makeMockLlmProvider([
        { content: 'Done', finishReason: 'stop' },
      ]);
      const executor = makeMockToolExecutor({});
      const agent = new AgentService(provider, registry, executor);

      const states: string[] = [];
      await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
        { onStateChange: (s) => states.push(s) },
      );

      expect(states[0]).toBe('thinking');
      expect(states[states.length - 1]).toBe('idle');
    });
  });

  describe('executeTurn — thinking capture', () => {
    it('extracts thinking blocks from response content', async () => {
      const provider = makeMockLlmProvider([
        {
          content: '<thinking>Let me analyze this carefully.</thinking>\nHere is my analysis.',
          finishReason: 'stop',
        },
      ]);
      const executor = makeMockToolExecutor({});
      const agent = new AgentService(provider, registry, executor);

      const thinkingTexts: string[] = [];
      const blocksList: ContentBlock[] = [];

      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
        {
          onThinking: (t) => thinkingTexts.push(t),
          onBlock: (b) => blocksList.push(b),
        },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Here is my analysis.');
        expect(result.value.blocks).toHaveLength(1);
        expect(result.value.blocks[0]!.type).toBe('thinking');
        expect((result.value.blocks[0]!.data as { thinking: string }).thinking).toBe(
          'Let me analyze this carefully.',
        );
      }

      expect(thinkingTexts).toContain('Let me analyze this carefully.');
      expect(blocksList).toHaveLength(1);
    });

    it('handles response without thinking', async () => {
      const provider = makeMockLlmProvider([
        { content: 'No thinking here.', finishReason: 'stop' },
      ]);
      const executor = makeMockToolExecutor({});
      const agent = new AgentService(provider, registry, executor);

      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('No thinking here.');
        expect(result.value.blocks).toHaveLength(0);
      }
    });
  });

  describe('executeTurn — render tool execution', () => {
    it('executes a render tool and produces a content block', async () => {
      registry.register(makeTool('render_swot_analysis'), 'render');

      const swotBlock: ContentBlock = {
        type: 'swot_analysis',
        id: 'test-block-1',
        data: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
      };

      const provider = makeMockLlmProvider([
        // First response: tool call
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: 'call_1',
              name: 'render_swot_analysis',
              arguments: JSON.stringify({ strengths: [], weaknesses: [], opportunities: [], threats: [] }),
            },
          ],
        },
        // Second response: final text after tool result
        { content: 'Here are the SWOT results.', finishReason: 'stop' },
      ]);

      const executor = makeMockToolExecutor({
        render_swot_analysis: { block: swotBlock },
      });

      const agent = new AgentService(provider, registry, executor);

      const blocksEmitted: ContentBlock[] = [];
      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
        { onBlock: (b) => blocksEmitted.push(b) },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Here are the SWOT results.');
        expect(result.value.blocks).toHaveLength(1);
        expect(result.value.blocks[0]!.type).toBe('swot_analysis');
      }

      // Verify tool executor was called
      expect(executor.execute).toHaveBeenCalledWith(
        'render_swot_analysis',
        'render',
        expect.any(Object),
      );

      // Verify block was emitted via callback
      expect(blocksEmitted).toHaveLength(1);
    });

    it('sends compact confirmation as tool_result for render tools', async () => {
      registry.register(makeTool('render_mermaid'), 'render');

      const mermaidBlock: ContentBlock = {
        type: 'mermaid',
        id: 'mermaid-1',
        data: { title: 'Arch', source: 'graph TD; A-->B' },
      };

      const provider = makeMockLlmProvider([
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: 'call_1',
              name: 'render_mermaid',
              arguments: JSON.stringify({ title: 'Arch', source: 'graph TD; A-->B' }),
            },
          ],
        },
        { content: 'Diagram rendered.', finishReason: 'stop' },
      ]);

      const executor = makeMockToolExecutor({
        render_mermaid: { block: mermaidBlock },
      });

      const agent = new AgentService(provider, registry, executor);
      await agent.executeTurn(TEST_API_KEY, TEST_MODEL_ID, [systemMessage, userMessage]);

      // Verify the LLM received a compact confirmation, not the full block data
      const secondCall = (provider.createChatCompletion as ReturnType<typeof vi.fn>).mock.calls[1]!;
      const toolResultMessage = secondCall[0].messages.find(
        (m: AgentMessage) => m.role === 'tool',
      );
      expect(toolResultMessage).toBeDefined();
      const parsed = JSON.parse(toolResultMessage.content);
      expect(parsed.rendered).toBe('mermaid');
      expect(parsed.blockId).toBe('mermaid-1');
    });
  });

  describe('executeTurn — read tool execution', () => {
    it('executes a read tool and feeds results back to LLM', async () => {
      registry.register(makeTool('fetch_jira_data'), 'read');

      const provider = makeMockLlmProvider([
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: 'call_1',
              name: 'fetch_jira_data',
              arguments: JSON.stringify({ project: 'PROJ' }),
            },
          ],
        },
        { content: 'Based on the Jira data...', finishReason: 'stop' },
      ]);

      const executor = makeMockToolExecutor({
        fetch_jira_data: { content: JSON.stringify({ issues: [{ key: 'PROJ-1' }] }) },
      });

      const agent = new AgentService(provider, registry, executor);

      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Based on the Jira data...');
        expect(result.value.blocks).toHaveLength(0); // Read tools don't produce blocks
      }

      // Verify tool result was passed back to LLM
      const secondCall = (provider.createChatCompletion as ReturnType<typeof vi.fn>).mock.calls[1]!;
      const toolResult = secondCall[0].messages.find((m: AgentMessage) => m.role === 'tool');
      expect(toolResult.content).toContain('PROJ-1');
    });
  });

  describe('executeTurn — write tool approval', () => {
    it('requests approval for write tools and executes on approve', async () => {
      registry.register(makeTool('create_jira_issue'), 'write');

      const provider = makeMockLlmProvider([
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: 'call_1',
              name: 'create_jira_issue',
              arguments: JSON.stringify({ project: 'PROJ', summary: 'Test issue' }),
            },
          ],
        },
        { content: 'Issue created successfully.', finishReason: 'stop' },
      ]);

      const executor = makeMockToolExecutor({
        create_jira_issue: { content: JSON.stringify({ success: true, id: 'PROJ-42' }) },
      });

      const agent = new AgentService(provider, registry, executor);

      const approvalRequests: string[] = [];
      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
        {
          onApprovalRequest: async (toolName) => {
            approvalRequests.push(toolName);
            return true; // Approve
          },
        },
      );

      expect(result.ok).toBe(true);
      expect(approvalRequests).toEqual(['create_jira_issue']);
      expect(executor.execute).toHaveBeenCalledWith(
        'create_jira_issue',
        'write',
        { project: 'PROJ', summary: 'Test issue' },
      );
    });

    it('sends rejection message when user declines write tool', async () => {
      registry.register(makeTool('create_jira_issue'), 'write');

      const provider = makeMockLlmProvider([
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: 'call_1',
              name: 'create_jira_issue',
              arguments: JSON.stringify({ project: 'PROJ', summary: 'Test' }),
            },
          ],
        },
        { content: 'Understood, I won\'t create the issue.', finishReason: 'stop' },
      ]);

      const executor = makeMockToolExecutor({});
      const agent = new AgentService(provider, registry, executor);

      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
        { onApprovalRequest: async () => false }, // Reject
      );

      expect(result.ok).toBe(true);
      // Executor should NOT have been called
      expect(executor.execute).not.toHaveBeenCalled();

      // Verify rejection message was sent to LLM
      const secondCall = (provider.createChatCompletion as ReturnType<typeof vi.fn>).mock.calls[1]!;
      const toolResult = secondCall[0].messages.find((m: AgentMessage) => m.role === 'tool');
      expect(toolResult.content).toContain('declined');
    });

    it('auto-rejects write tools when no approval callback provided', async () => {
      registry.register(makeTool('create_jira_issue'), 'write');

      const provider = makeMockLlmProvider([
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: 'call_1',
              name: 'create_jira_issue',
              arguments: JSON.stringify({ project: 'PROJ' }),
            },
          ],
        },
        { content: 'OK', finishReason: 'stop' },
      ]);

      const executor = makeMockToolExecutor({});
      const agent = new AgentService(provider, registry, executor);

      await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
        {}, // No onApprovalRequest
      );

      expect(executor.execute).not.toHaveBeenCalled();
    });
  });

  describe('executeTurn — multi-turn loop', () => {
    it('loops until LLM returns no tool calls', async () => {
      registry.register(makeTool('fetch_jira_data'), 'read');
      registry.register(makeTool('render_data_table'), 'render');

      const tableBlock: ContentBlock = {
        type: 'data_table',
        id: 'table-1',
        data: { title: 'Summary', headers: ['Col'], rows: [['Val']] },
      };

      const provider = makeMockLlmProvider([
        // Turn 1: read tool
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [
            { id: 'call_1', name: 'fetch_jira_data', arguments: '{"project":"PROJ"}' },
          ],
        },
        // Turn 2: render tool based on read results
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: 'call_2',
              name: 'render_data_table',
              arguments: JSON.stringify({ title: 'Summary', headers: ['Col'], rows: [['Val']] }),
            },
          ],
        },
        // Turn 3: final text
        { content: 'Here is the summary table.', finishReason: 'stop' },
      ]);

      const executor = makeMockToolExecutor({
        fetch_jira_data: { content: JSON.stringify({ data: 'jira results' }) },
        render_data_table: { block: tableBlock },
      });

      const agent = new AgentService(provider, registry, executor);

      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Here is the summary table.');
        expect(result.value.blocks).toHaveLength(1);
        expect(result.value.blocks[0]!.type).toBe('data_table');
      }

      // LLM was called 3 times
      expect(provider.createChatCompletion).toHaveBeenCalledTimes(3);
    });
  });

  describe('executeTurn — error handling', () => {
    it('handles invalid tool arguments gracefully', async () => {
      registry.register(makeTool('render_swot_analysis'), 'render');

      const provider = makeMockLlmProvider([
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [
            { id: 'call_1', name: 'render_swot_analysis', arguments: 'invalid json{{{' },
          ],
        },
        { content: 'I had trouble with that tool.', finishReason: 'stop' },
      ]);

      const executor = makeMockToolExecutor({});
      const agent = new AgentService(provider, registry, executor);

      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
      );

      expect(result.ok).toBe(true);
      // Verify error message was sent back to LLM
      const secondCall = (provider.createChatCompletion as ReturnType<typeof vi.fn>).mock.calls[1]!;
      const toolResult = secondCall[0].messages.find((m: AgentMessage) => m.role === 'tool');
      expect(toolResult.content).toContain('Invalid tool arguments');
    });

    it('handles unknown tool names gracefully', async () => {
      const provider = makeMockLlmProvider([
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [
            { id: 'call_1', name: 'nonexistent_tool', arguments: '{}' },
          ],
        },
        { content: 'Let me try something else.', finishReason: 'stop' },
      ]);

      const executor = makeMockToolExecutor({});
      const agent = new AgentService(provider, registry, executor);

      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
      );

      expect(result.ok).toBe(true);
      const secondCall = (provider.createChatCompletion as ReturnType<typeof vi.fn>).mock.calls[1]!;
      const toolResult = secondCall[0].messages.find((m: AgentMessage) => m.role === 'tool');
      expect(toolResult.content).toContain('Unknown tool');
    });

    it('returns error result when LLM provider throws', async () => {
      const provider: LLMProvider = {
        name: 'failing-mock',
        listModels: vi.fn(),
        createChatCompletion: vi.fn().mockRejectedValue(new Error('Network error')),
      };

      const executor = makeMockToolExecutor({});
      const agent = new AgentService(provider, registry, executor);

      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('LLM_REQUEST_FAILED');
      }
    });
  });

  describe('interrupt', () => {
    it('interrupts the current turn', async () => {
      registry.register(makeTool('fetch_jira_data'), 'read');

      // Provider that delays, allowing us to interrupt
      const provider: LLMProvider = {
        name: 'slow-mock',
        listModels: vi.fn(),
        createChatCompletion: vi.fn(async () => {
          // Simulate some work
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            content: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'call_1', name: 'fetch_jira_data', arguments: '{}' }],
          };
        }),
      };

      // Executor that takes some time — agent interrupts during this
      const executor: ToolExecutorInterface = {
        execute: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { content: 'data' };
        }),
      };

      const agent = new AgentService(provider, registry, executor);

      // Start the turn and interrupt after a short delay
      const turnPromise = agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
      );

      // Interrupt quickly
      setTimeout(() => agent.interrupt(), 30);

      const result = await turnPromise;
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.interrupted).toBe(true);
      }
    });

    it('isRunning reflects active state', async () => {
      const provider = makeMockLlmProvider([
        { content: 'Done', finishReason: 'stop' },
      ]);
      const executor = makeMockToolExecutor({});
      const agent = new AgentService(provider, registry, executor);

      expect(agent.isRunning).toBe(false);

      const turnPromise = agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
      );

      // isRunning should be true during execution
      // (since the mock resolves immediately, we check after)
      await turnPromise;
      expect(agent.isRunning).toBe(false);
    });

    it('interrupt is safe to call when not running', () => {
      const provider = makeMockLlmProvider([]);
      const executor = makeMockToolExecutor({});
      const agent = new AgentService(provider, registry, executor);

      // Should not throw
      agent.interrupt();
      expect(agent.isRunning).toBe(false);
    });
  });

  describe('executeTurn — token counting', () => {
    it('accumulates token usage from LLM responses', async () => {
      const provider = makeMockLlmProvider([
        { content: 'Hello', finishReason: 'stop', usage: { inputTokens: 100, outputTokens: 50 } },
      ]);
      const executor = makeMockToolExecutor({});
      const agent = new AgentService(provider, registry, executor);

      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.inputTokens).toBe(100);
        expect(result.value.outputTokens).toBe(50);
      }
    });

    it('accumulates tokens across multi-turn tool loop', async () => {
      registry.register(makeTool('fetch_data'), 'read');

      const provider = makeMockLlmProvider([
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [{ id: 'call_1', name: 'fetch_data', arguments: '{}' }],
          usage: { inputTokens: 200, outputTokens: 30 },
        },
        {
          content: 'Done.',
          finishReason: 'stop',
          usage: { inputTokens: 350, outputTokens: 80 },
        },
      ]);

      const executor = makeMockToolExecutor({
        fetch_data: { content: '{"data": "value"}' },
      });
      const agent = new AgentService(provider, registry, executor);

      const tokenCounts: Array<{ input: number; output: number }> = [];
      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
        { onTokenCount: (input, output) => tokenCounts.push({ input, output }) },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.inputTokens).toBe(550); // 200 + 350
        expect(result.value.outputTokens).toBe(110); // 30 + 80
      }

      // Callback should have been fired multiple times
      expect(tokenCounts.length).toBeGreaterThanOrEqual(2);
      // Last callback should have final totals
      const last = tokenCounts[tokenCounts.length - 1]!;
      expect(last.input).toBe(550);
      expect(last.output).toBe(110);
    });

    it('handles responses without usage gracefully', async () => {
      const provider = makeMockLlmProvider([
        { content: 'No usage info', finishReason: 'stop' }, // no usage field
      ]);
      const executor = makeMockToolExecutor({});
      const agent = new AgentService(provider, registry, executor);

      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.inputTokens).toBe(0);
        expect(result.value.outputTokens).toBe(0);
      }
    });
  });

  describe('executeTurn — thinking + tool calls combined', () => {
    it('captures thinking and executes tool calls in the same response', async () => {
      registry.register(makeTool('render_swot_analysis'), 'render');

      const swotBlock: ContentBlock = {
        type: 'swot_analysis',
        id: 'swot-1',
        data: { strengths: [{ claim: 'test', evidence: [], impact: '', recommendation: '', confidence: 'medium' as const }], weaknesses: [], opportunities: [], threats: [] },
      };

      const provider = makeMockLlmProvider([
        {
          content: '<thinking>I should render the SWOT analysis.</thinking>',
          finishReason: 'tool_calls',
          toolCalls: [
            { id: 'call_1', name: 'render_swot_analysis', arguments: '{}' },
          ],
        },
        { content: 'Analysis complete.', finishReason: 'stop' },
      ]);

      const executor = makeMockToolExecutor({
        render_swot_analysis: { block: swotBlock },
      });

      const agent = new AgentService(provider, registry, executor);

      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.blocks).toHaveLength(2); // thinking + swot
        expect(result.value.blocks[0]!.type).toBe('thinking');
        expect(result.value.blocks[1]!.type).toBe('swot_analysis');
        expect(result.value.content).toBe('Analysis complete.');
      }
    });
  });

  describe('executeTurn — multiple tool calls in one response', () => {
    it('executes multiple tool calls from a single LLM response', async () => {
      registry.register(makeTool('fetch_jira_data'), 'read');
      registry.register(makeTool('fetch_github_data'), 'read');

      const provider = makeMockLlmProvider([
        {
          content: '<thinking>I need data from both sources.</thinking>',
          finishReason: 'tool_calls',
          toolCalls: [
            { id: 'call_1', name: 'fetch_jira_data', arguments: '{"project":"PROJ"}' },
            { id: 'call_2', name: 'fetch_github_data', arguments: '{"repo":"org/repo"}' },
          ],
        },
        { content: 'Based on both data sources...', finishReason: 'stop' },
      ]);

      const executor = makeMockToolExecutor({
        fetch_jira_data: { content: '{"epics":[{"key":"PROJ-1"}]}' },
        fetch_github_data: { content: '{"prs":[{"number":42}]}' },
      });

      const agent = new AgentService(provider, registry, executor);
      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.blocks).toHaveLength(1); // thinking only
        expect(result.value.blocks[0]!.type).toBe('thinking');
        expect(result.value.content).toBe('Based on both data sources...');
      }

      // Both tools were executed
      expect(executor.execute).toHaveBeenCalledTimes(2);

      // LLM received both tool results
      const secondCall = (provider.createChatCompletion as ReturnType<typeof vi.fn>).mock.calls[1]!;
      const toolResults = secondCall[0].messages.filter((m: AgentMessage) => m.role === 'tool');
      expect(toolResults).toHaveLength(2);
    });
  });

  describe('executeTurn — mixed tool categories in multi-turn', () => {
    it('executes render, read, and write tools across turns', async () => {
      registry.register(makeTool('fetch_jira_data'), 'read');
      registry.register(makeTool('render_data_table'), 'render');
      registry.register(makeTool('write_file'), 'write');

      const tableBlock: ContentBlock = {
        type: 'data_table',
        id: 'table-1',
        data: { title: 'Results', headers: ['Item'], rows: [['A']] },
      };

      const provider = makeMockLlmProvider([
        // Turn 1: read
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [{ id: 'c1', name: 'fetch_jira_data', arguments: '{}' }],
          usage: { inputTokens: 100, outputTokens: 20 },
        },
        // Turn 2: render
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [{ id: 'c2', name: 'render_data_table', arguments: '{}' }],
          usage: { inputTokens: 200, outputTokens: 30 },
        },
        // Turn 3: write (with approval)
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [{ id: 'c3', name: 'write_file', arguments: '{"path":"report.md","content":"# Report"}' }],
          usage: { inputTokens: 250, outputTokens: 25 },
        },
        // Turn 4: final
        {
          content: 'All done — data fetched, table rendered, file written.',
          finishReason: 'stop',
          usage: { inputTokens: 300, outputTokens: 40 },
        },
      ]);

      const executor = makeMockToolExecutor({
        fetch_jira_data: { content: '{"data":"jira"}' },
        render_data_table: { block: tableBlock },
        write_file: { content: '{"success":true,"path":"report.md"}' },
      });

      const agent = new AgentService(provider, registry, executor);
      const states: string[] = [];

      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
        {
          onApprovalRequest: async () => true,
          onStateChange: (s) => states.push(s),
        },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.blocks).toHaveLength(1); // data_table
        expect(result.value.blocks[0]!.type).toBe('data_table');
        expect(result.value.content).toBe('All done — data fetched, table rendered, file written.');
        expect(result.value.inputTokens).toBe(850);
        expect(result.value.outputTokens).toBe(115);
      }

      // 4 LLM calls
      expect(provider.createChatCompletion).toHaveBeenCalledTimes(4);

      // State transitions include awaiting_approval for write tool
      expect(states).toContain('awaiting_approval');
      expect(states).toContain('executing_tool');
      expect(states[states.length - 1]).toBe('idle');
    });
  });

  describe('executeTurn — approval state transitions', () => {
    it('transitions through awaiting_approval and back to executing_tool', async () => {
      registry.register(makeTool('create_jira_issue'), 'write');

      const provider = makeMockLlmProvider([
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [{ id: 'c1', name: 'create_jira_issue', arguments: '{}' }],
        },
        { content: 'Done.', finishReason: 'stop' },
      ]);

      const executor = makeMockToolExecutor({
        create_jira_issue: { content: '{"success":true}' },
      });

      const agent = new AgentService(provider, registry, executor);
      const states: string[] = [];

      await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
        {
          onApprovalRequest: async () => true,
          onStateChange: (s) => states.push(s),
        },
      );

      // Verify state flow: thinking → executing_tool → awaiting_approval → executing_tool → thinking → idle
      expect(states).toContain('thinking');
      expect(states).toContain('executing_tool');
      expect(states).toContain('awaiting_approval');

      const awaitIdx = states.indexOf('awaiting_approval');
      expect(states[awaitIdx + 1]).toBe('executing_tool');
    });
  });

  describe('executeTurn — MAX_LOOP_ITERATIONS guard', () => {
    it('stops after MAX_LOOP_ITERATIONS and marks as interrupted with notice', async () => {
      registry.register(makeTool('fetch_data'), 'read');

      // Always return a tool call — never stop
      const infiniteResponses = Array.from({ length: 30 }, (_, i) => ({
        content: '',
        finishReason: 'tool_calls' as const,
        toolCalls: [{ id: `call_${i}`, name: 'fetch_data', arguments: '{}' }],
      }));

      const provider = makeMockLlmProvider(infiniteResponses);
      const executor = makeMockToolExecutor({
        fetch_data: { content: '{"data":"ok"}' },
      });

      const agent = new AgentService(provider, registry, executor);
      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should be marked as interrupted
        expect(result.value.interrupted).toBe(true);
        // Should include truncation notice
        expect(result.value.content).toContain('maximum number of iterations');
      }
      // Should have stopped at MAX_LOOP_ITERATIONS (25)
      expect(provider.createChatCompletion).toHaveBeenCalledTimes(25);
    });
  });

  describe('executeTurn — error recovery mid-loop', () => {
    it('handles tool executor error and continues the loop', async () => {
      registry.register(makeTool('fetch_data'), 'read');
      registry.register(makeTool('render_mermaid'), 'render');

      const mermaidBlock: ContentBlock = {
        type: 'mermaid',
        id: 'mermaid-1',
        data: { title: 'Arch', source: 'graph TD; A-->B' },
      };

      // First tool call → executor returns error content, second → success
      let callCount = 0;
      const executor: ToolExecutorInterface = {
        execute: vi.fn(async (toolName: string) => {
          callCount++;
          if (toolName === 'fetch_data') {
            return { content: JSON.stringify({ error: 'Integration disconnected' }) };
          }
          return { block: mermaidBlock };
        }),
      };

      const provider = makeMockLlmProvider([
        // Turn 1: read tool (will get error response)
        {
          content: '<thinking>Fetching data first.</thinking>',
          finishReason: 'tool_calls',
          toolCalls: [{ id: 'c1', name: 'fetch_data', arguments: '{}' }],
        },
        // Turn 2: LLM adapts, tries render instead
        {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [{ id: 'c2', name: 'render_mermaid', arguments: '{"title":"Arch","source":"graph TD; A-->B"}' }],
        },
        // Turn 3: final
        { content: 'Diagram rendered despite data fetch error.', finishReason: 'stop' },
      ]);

      const agent = new AgentService(provider, registry, executor);
      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Diagram rendered despite data fetch error.');
        // thinking + mermaid
        expect(result.value.blocks).toHaveLength(2);
        expect(result.value.blocks[0]!.type).toBe('thinking');
        expect(result.value.blocks[1]!.type).toBe('mermaid');
      }

      expect(callCount).toBe(2);
    });
  });

  describe('executeTurn — LLM error mid-loop', () => {
    it('returns partial results when LLM fails on second call', async () => {
      registry.register(makeTool('fetch_data'), 'read');

      let callIndex = 0;
      const provider: LLMProvider = {
        name: 'flaky-mock',
        listModels: vi.fn(),
        createChatCompletion: vi.fn(async () => {
          callIndex++;
          if (callIndex === 1) {
            return {
              content: '',
              finishReason: 'tool_calls',
              toolCalls: [{ id: 'c1', name: 'fetch_data', arguments: '{}' }],
            };
          }
          throw new Error('Rate limited');
        }),
      };

      const executor = makeMockToolExecutor({
        fetch_data: { content: '{"data":"ok"}' },
      });

      const agent = new AgentService(provider, registry, executor);
      const states: string[] = [];

      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
        { onStateChange: (s) => states.push(s) },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('LLM_REQUEST_FAILED');
      }

      // State should end in error
      expect(states[states.length - 1]).toBe('error');
    });
  });

  describe('executeTurn — thinking in every round', () => {
    it('accumulates thinking blocks from multiple LLM rounds', async () => {
      registry.register(makeTool('fetch_data'), 'read');

      const provider = makeMockLlmProvider([
        {
          content: '<thinking>First, let me fetch the data.</thinking>',
          finishReason: 'tool_calls',
          toolCalls: [{ id: 'c1', name: 'fetch_data', arguments: '{}' }],
        },
        {
          content: '<thinking>Good, now let me analyze what I found.</thinking>\nHere are my findings.',
          finishReason: 'stop',
        },
      ]);

      const executor = makeMockToolExecutor({
        fetch_data: { content: '{"results":[]}' },
      });

      const agent = new AgentService(provider, registry, executor);
      const thinkingTexts: string[] = [];

      const result = await agent.executeTurn(
        TEST_API_KEY,
        TEST_MODEL_ID,
        [systemMessage, userMessage],
        { onThinking: (t) => thinkingTexts.push(t) },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Two thinking blocks from two rounds
        expect(result.value.blocks.filter((b) => b.type === 'thinking')).toHaveLength(2);
        expect(result.value.content).toBe('Here are my findings.');
      }

      expect(thinkingTexts).toHaveLength(2);
      expect(thinkingTexts[0]).toBe('First, let me fetch the data.');
      expect(thinkingTexts[1]).toBe('Good, now let me analyze what I found.');
    });
  });
});

describe('extractThinking', () => {
  it('extracts thinking from content with thinking tags', () => {
    const input = '<thinking>Step 1: analyze data.</thinking>\nHere is my response.';
    const { thinking, cleanContent } = extractThinking(input);

    expect(thinking).toBe('Step 1: analyze data.');
    expect(cleanContent).toBe('Here is my response.');
  });

  it('handles multiline thinking', () => {
    const input = '<thinking>Line 1.\nLine 2.\nLine 3.</thinking>\nResponse.';
    const { thinking, cleanContent } = extractThinking(input);

    expect(thinking).toBe('Line 1.\nLine 2.\nLine 3.');
    expect(cleanContent).toBe('Response.');
  });

  it('returns null thinking when no thinking tags present', () => {
    const input = 'Just a normal response.';
    const { thinking, cleanContent } = extractThinking(input);

    expect(thinking).toBeNull();
    expect(cleanContent).toBe('Just a normal response.');
  });

  it('handles empty content', () => {
    const { thinking, cleanContent } = extractThinking('');
    expect(thinking).toBeNull();
    expect(cleanContent).toBe('');
  });

  it('handles thinking at start only', () => {
    const input = '<thinking>Some thought.</thinking>';
    const { thinking, cleanContent } = extractThinking(input);

    expect(thinking).toBe('Some thought.');
    expect(cleanContent).toBe('');
  });

  it('does not extract thinking tags in the middle of content', () => {
    const input = 'Prefix <thinking>mid</thinking> suffix';
    const { thinking, cleanContent } = extractThinking(input);

    expect(thinking).toBeNull();
    expect(cleanContent).toBe(input);
  });
});
