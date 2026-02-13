import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAgentHarness } from './agent-harness-factory';
import { resetBlockIdCounter } from '../../services/agent.service';
import type { AgentTurnCallbacks, ContentBlock, AgentState } from '../../services/agent.service';
import type { LLMProvider } from '../llm/llm-provider.interface';
import type { LlmResponse, LlmCompletionRequest } from '../llm/llm.types';
import { ok, err } from '../../domain/result';
import { DomainError, ERROR_CODES } from '../../domain/errors';

/**
 * Integration tests for the fully-wired agent harness.
 *
 * These tests use createAgentHarness() with real RenderExecutor, ReadExecutor,
 * and WriteExecutor (mocked external dependencies). They validate the complete
 * flow from tool definition → tool execution → content block production.
 */

// --- Test helpers ---

function makeSequentialLlm(responses: LlmResponse[]): LLMProvider {
  let callIndex = 0;
  return {
    name: 'integration-mock',
    listModels: vi.fn().mockResolvedValue([]),
    createChatCompletion: vi.fn(async (request: LlmCompletionRequest) => {
      const response = responses[callIndex];
      if (!response) throw new Error(`No response for call ${callIndex}`);
      callIndex++;
      if (request.onChunk && response.content) {
        request.onChunk(response.content);
      }
      return response;
    }),
  };
}

const API_KEY = 'test-key';
const MODEL_ID = 'test-model';
const MESSAGES = [
  { role: 'system' as const, content: 'You are an analysis agent.' },
  { role: 'user' as const, content: 'Analyze this workspace.' },
];

describe('Agent Harness Integration', () => {
  beforeEach(() => {
    resetBlockIdCounter();
  });

  it('executes render_swot_analysis through the full stack', async () => {
    const provider = makeSequentialLlm([
      {
        content: '<thinking>I will render the SWOT analysis.</thinking>',
        finishReason: 'tool_calls',
        toolCalls: [{
          id: 'c1',
          name: 'render_swot_analysis',
          arguments: JSON.stringify({
            strengths: [{ claim: 'Strong CI/CD', evidence: [], impact: 'High', recommendation: 'Keep', confidence: 'high' }],
            weaknesses: [],
            opportunities: [],
            threats: [],
          }),
        }],
      },
      { content: 'SWOT analysis rendered above.', finishReason: 'stop' },
    ]);

    const agent = createAgentHarness({
      llmProvider: provider,
      comparisonService: { compare: vi.fn() } as any,
      integrationRepo: { findByWorkspaceAndProvider: vi.fn() } as any,
      integrationCacheRepo: { findByType: vi.fn(), findEntry: vi.fn() } as any,
      profileRepo: { findByWorkspace: vi.fn() } as any,
      workspaceService: { getCurrentId: vi.fn().mockReturnValue('ws-1') } as any,
    });

    const blocks: ContentBlock[] = [];
    const result = await agent.executeTurn(API_KEY, MODEL_ID, MESSAGES, {
      onBlock: (b) => blocks.push(b),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // thinking + swot_analysis
      expect(result.value.blocks).toHaveLength(2);
      expect(result.value.blocks[0]!.type).toBe('thinking');
      expect(result.value.blocks[1]!.type).toBe('swot_analysis');

      const swotData = result.value.blocks[1]!.data as { strengths: unknown[] };
      expect(swotData.strengths).toHaveLength(1);
    }

    expect(blocks).toHaveLength(2);
  });

  it('executes render_mermaid and render_chart in sequence', async () => {
    const provider = makeSequentialLlm([
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'c1',
            name: 'render_mermaid',
            arguments: JSON.stringify({ title: 'Architecture', source: 'graph TD; A-->B' }),
          },
        ],
      },
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'c2',
            name: 'render_chart',
            arguments: JSON.stringify({
              title: 'Sprint Velocity',
              chartType: 'bar',
              spec: { labels: ['S1', 'S2'], datasets: [{ data: [10, 15] }] },
            }),
          },
        ],
      },
      { content: 'Diagram and chart rendered.', finishReason: 'stop' },
    ]);

    const agent = createAgentHarness({
      llmProvider: provider,
      comparisonService: { compare: vi.fn() } as any,
      integrationRepo: { findByWorkspaceAndProvider: vi.fn() } as any,
      integrationCacheRepo: { findByType: vi.fn(), findEntry: vi.fn() } as any,
      profileRepo: { findByWorkspace: vi.fn() } as any,
      workspaceService: { getCurrentId: vi.fn().mockReturnValue('ws-1') } as any,
    });

    const result = await agent.executeTurn(API_KEY, MODEL_ID, MESSAGES);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.blocks).toHaveLength(2);
      expect(result.value.blocks[0]!.type).toBe('mermaid');
      expect(result.value.blocks[1]!.type).toBe('chart');
    }
  });

  it('executes read tools with real ReadExecutor (disconnected integration)', async () => {
    const integrationRepo = {
      findByWorkspaceAndProvider: vi.fn().mockReturnValue(null),
    };

    const provider = makeSequentialLlm([
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [{
          id: 'c1',
          name: 'fetch_jira_data',
          arguments: '{}',
        }],
      },
      { content: 'Jira is not connected.', finishReason: 'stop' },
    ]);

    const agent = createAgentHarness({
      llmProvider: provider,
      comparisonService: { compare: vi.fn() } as any,
      integrationRepo: integrationRepo as any,
      integrationCacheRepo: { findByType: vi.fn(), findEntry: vi.fn() } as any,
      profileRepo: { findByWorkspace: vi.fn() } as any,
      workspaceService: { getCurrentId: vi.fn().mockReturnValue('ws-1') } as any,
    });

    const result = await agent.executeTurn(API_KEY, MODEL_ID, MESSAGES);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('Jira is not connected.');
    }

    // ReadExecutor checked integration status
    expect(integrationRepo.findByWorkspaceAndProvider).toHaveBeenCalledWith('ws-1', 'jira');
  });

  it('executes write_file with approval through WriteExecutor', async () => {
    const fileService = {
      writeFile: vi.fn().mockResolvedValue(ok(undefined)),
      listDirectory: vi.fn(),
      readFile: vi.fn(),
    };

    const provider = makeSequentialLlm([
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [{
          id: 'c1',
          name: 'write_file',
          arguments: JSON.stringify({ path: 'reports/analysis.md', content: '# Report' }),
        }],
      },
      { content: 'File written successfully.', finishReason: 'stop' },
    ]);

    const agent = createAgentHarness({
      llmProvider: provider,
      comparisonService: { compare: vi.fn() } as any,
      integrationRepo: { findByWorkspaceAndProvider: vi.fn() } as any,
      integrationCacheRepo: { findByType: vi.fn(), findEntry: vi.fn() } as any,
      profileRepo: { findByWorkspace: vi.fn() } as any,
      workspaceService: { getCurrentId: vi.fn().mockReturnValue('ws-1') } as any,
      fileService: fileService as any,
    });

    const states: string[] = [];
    const result = await agent.executeTurn(API_KEY, MODEL_ID, MESSAGES, {
      onApprovalRequest: async () => true, // Approve
      onStateChange: (s) => states.push(s),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('File written successfully.');
    }

    expect(fileService.writeFile).toHaveBeenCalledWith('reports/analysis.md', '# Report');
    expect(states).toContain('awaiting_approval');
  });

  it('rejects write_file when user declines approval', async () => {
    const fileService = {
      writeFile: vi.fn(),
      listDirectory: vi.fn(),
      readFile: vi.fn(),
    };

    const provider = makeSequentialLlm([
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [{
          id: 'c1',
          name: 'write_file',
          arguments: JSON.stringify({ path: 'report.md', content: 'data' }),
        }],
      },
      { content: 'OK, I will not write the file.', finishReason: 'stop' },
    ]);

    const agent = createAgentHarness({
      llmProvider: provider,
      comparisonService: { compare: vi.fn() } as any,
      integrationRepo: { findByWorkspaceAndProvider: vi.fn() } as any,
      integrationCacheRepo: { findByType: vi.fn(), findEntry: vi.fn() } as any,
      profileRepo: { findByWorkspace: vi.fn() } as any,
      workspaceService: { getCurrentId: vi.fn().mockReturnValue('ws-1') } as any,
      fileService: fileService as any,
    });

    const result = await agent.executeTurn(API_KEY, MODEL_ID, MESSAGES, {
      onApprovalRequest: async () => false, // Reject
    });

    expect(result.ok).toBe(true);
    // FileService should NOT have been called
    expect(fileService.writeFile).not.toHaveBeenCalled();
  });

  it('validates render tool inputs through real RenderExecutor', async () => {
    const provider = makeSequentialLlm([
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [{
          id: 'c1',
          name: 'render_swot_analysis',
          arguments: JSON.stringify({
            strengths: 'not an array',
            weaknesses: [],
            opportunities: [],
            threats: [],
          }),
        }],
      },
      { content: 'The SWOT data was invalid, let me fix it.', finishReason: 'stop' },
    ]);

    const agent = createAgentHarness({
      llmProvider: provider,
      comparisonService: { compare: vi.fn() } as any,
      integrationRepo: { findByWorkspaceAndProvider: vi.fn() } as any,
      integrationCacheRepo: { findByType: vi.fn(), findEntry: vi.fn() } as any,
      profileRepo: { findByWorkspace: vi.fn() } as any,
      workspaceService: { getCurrentId: vi.fn().mockReturnValue('ws-1') } as any,
    });

    const result = await agent.executeTurn(API_KEY, MODEL_ID, MESSAGES);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // No blocks produced (validation failed)
      expect(result.value.blocks).toHaveLength(0);
    }

    // LLM received error message from validation
    const secondCall = (provider.createChatCompletion as ReturnType<typeof vi.fn>).mock.calls[1];
    const toolResult = secondCall[0].messages.find(
      (m: { role: string }) => m.role === 'tool',
    );
    expect(toolResult.content).toContain('requires');
  });

  it('full lifecycle: read → render → write across three turns', async () => {
    const cacheRepo = {
      findByType: vi.fn().mockReturnValue([
        { id: 'e1', type: 'jira_epic', data: JSON.stringify({ key: 'PROJ-1', summary: 'Epic 1' }) },
      ]),
      findEntry: vi.fn(),
    };
    const integrationRepo = {
      findByWorkspaceAndProvider: vi.fn().mockReturnValue({ id: 'int-1' }),
    };
    const fileService = {
      writeFile: vi.fn().mockResolvedValue(ok(undefined)),
      listDirectory: vi.fn(),
      readFile: vi.fn(),
    };

    const provider = makeSequentialLlm([
      // Turn 1: read data
      {
        content: '<thinking>Let me fetch Jira data first.</thinking>',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'c1', name: 'fetch_jira_data', arguments: '{}' }],
        usage: { inputTokens: 500, outputTokens: 100 },
      },
      // Turn 2: render results
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [{
          id: 'c2',
          name: 'render_summary_cards',
          arguments: JSON.stringify({
            profiles: 'No profiles loaded',
            jira: '1 epic found',
          }),
        }],
        usage: { inputTokens: 800, outputTokens: 150 },
      },
      // Turn 3: write report
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [{
          id: 'c3',
          name: 'write_file',
          arguments: JSON.stringify({ path: 'reports/summary.md', content: '# Summary\n\n1 epic found.' }),
        }],
        usage: { inputTokens: 1000, outputTokens: 80 },
      },
      // Turn 4: final
      {
        content: 'Analysis complete. Summary card rendered and report saved.',
        finishReason: 'stop',
        usage: { inputTokens: 1200, outputTokens: 60 },
      },
    ]);

    const agent = createAgentHarness({
      llmProvider: provider,
      comparisonService: { compare: vi.fn() } as any,
      integrationRepo: integrationRepo as any,
      integrationCacheRepo: cacheRepo as any,
      profileRepo: { findByWorkspace: vi.fn().mockReturnValue([]) } as any,
      workspaceService: { getCurrentId: vi.fn().mockReturnValue('ws-1') } as any,
      fileService: fileService as any,
    });

    const blocks: ContentBlock[] = [];
    const thinkingTexts: string[] = [];
    const states: AgentState[] = [];

    const result = await agent.executeTurn(API_KEY, MODEL_ID, MESSAGES, {
      onBlock: (b) => blocks.push(b),
      onThinking: (t) => thinkingTexts.push(t),
      onStateChange: (s) => states.push(s),
      onApprovalRequest: async () => true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('Analysis complete. Summary card rendered and report saved.');

      // thinking + summary_cards
      expect(result.value.blocks).toHaveLength(2);
      expect(result.value.blocks[0]!.type).toBe('thinking');
      expect(result.value.blocks[1]!.type).toBe('summary_cards');

      // Token accumulation
      expect(result.value.inputTokens).toBe(3500); // 500+800+1000+1200
      expect(result.value.outputTokens).toBe(390); // 100+150+80+60
    }

    // Callbacks fired correctly
    expect(thinkingTexts).toHaveLength(1);
    expect(blocks).toHaveLength(2);
    expect(states).toContain('awaiting_approval');
    expect(states[states.length - 1]).toBe('idle');

    // FileService was called
    expect(fileService.writeFile).toHaveBeenCalledWith(
      'reports/summary.md',
      '# Summary\n\n1 epic found.',
    );

    // 4 LLM calls
    expect(provider.createChatCompletion).toHaveBeenCalledTimes(4);
  });
});
