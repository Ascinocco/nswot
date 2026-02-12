import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from './anthropic.provider';
import { DomainError } from '../../domain/errors';

function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new AnthropicProvider();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listModels', () => {
    it('returns hardcoded Claude model list', async () => {
      const models = await provider.listModels('sk-test');
      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.id.startsWith('claude-'))).toBe(true);
      expect(models.every((m) => m.contextLength === 200000)).toBe(true);
    });
  });

  describe('createChatCompletion', () => {
    it('streams text content', async () => {
      const stream = createSSEStream([
        sseEvent({ type: 'message_start', message: { id: 'msg_1' } }),
        sseEvent({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
        sseEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } }),
        sseEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } }),
        sseEvent({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }),
        'data: [DONE]\n\n',
      ]);

      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      const result = await provider.createChatCompletion({
        apiKey: 'sk-ant-test',
        modelId: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.content).toBe('Hello world');
      expect(result.finishReason).toBe('stop'); // mapped from end_turn
      expect(result.toolCalls).toBeUndefined();
    });

    it('calls onChunk for each text delta', async () => {
      const stream = createSSEStream([
        sseEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'A' } }),
        sseEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'B' } }),
        sseEvent({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }),
      ]);

      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      const chunks: string[] = [];
      await provider.createChatCompletion({
        apiKey: 'sk-ant-test',
        modelId: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user', content: 'Hi' }],
        onChunk: (c) => chunks.push(c),
      });

      expect(chunks).toEqual(['A', 'B']);
    });

    it('extracts system message from messages array', async () => {
      const stream = createSSEStream([
        sseEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } }),
        sseEvent({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }),
      ]);

      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      await provider.createChatCompletion({
        apiKey: 'sk-ant-test',
        modelId: 'claude-sonnet-4-5-20250929',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hi' },
        ],
      });

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.system).toBe('You are helpful.');
      expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
    });

    it('sends correct auth headers', async () => {
      const stream = createSSEStream([
        sseEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } }),
        sseEvent({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }),
      ]);

      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      await provider.createChatCompletion({
        apiKey: 'sk-ant-key123',
        modelId: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      const headers = fetchMock.mock.calls[0]![1].headers;
      expect(headers['x-api-key']).toBe('sk-ant-key123');
      expect(headers['anthropic-version']).toBe('2023-06-01');
    });

    it('accumulates tool_use blocks', async () => {
      const stream = createSSEStream([
        sseEvent({
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_1', name: 'create_issue', input: {} },
        }),
        sseEvent({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"title":' },
        }),
        sseEvent({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '"bug"}' },
        }),
        sseEvent({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }),
      ]);

      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      const result = await provider.createChatCompletion({
        apiKey: 'sk-ant-test',
        modelId: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [{ type: 'function', function: { name: 'create_issue', parameters: {} } }],
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        id: 'toolu_1',
        name: 'create_issue',
        arguments: '{"title":"bug"}',
      });
      expect(result.finishReason).toBe('tool_calls'); // mapped from tool_use
    });

    it('maps OpenAI tool format to Anthropic format', async () => {
      const stream = createSSEStream([
        sseEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } }),
        sseEvent({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }),
      ]);

      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      const tools = [{
        type: 'function',
        function: {
          name: 'create_issue',
          description: 'Create a Jira issue',
          parameters: { type: 'object', properties: { title: { type: 'string' } } },
        },
      }];

      await provider.createChatCompletion({
        apiKey: 'sk-ant-test',
        modelId: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user', content: 'Hi' }],
        tools,
      });

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.tools).toEqual([{
        name: 'create_issue',
        description: 'Create a Jira issue',
        input_schema: { type: 'object', properties: { title: { type: 'string' } } },
      }]);
    });

    it('passes temperature and maxTokens', async () => {
      const stream = createSSEStream([
        sseEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } }),
        sseEvent({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }),
      ]);

      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      await provider.createChatCompletion({
        apiKey: 'sk-ant-test',
        modelId: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0,
        maxTokens: 16384,
      });

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.temperature).toBe(0);
      expect(body.max_tokens).toBe(16384);
    });

    it('throws ANTHROPIC_AUTH_FAILED on 401', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'invalid api key' } }),
      });

      try {
        await provider.createChatCompletion({
          apiKey: 'sk-bad',
          modelId: 'claude-sonnet-4-5-20250929',
          messages: [{ role: 'user', content: 'Hi' }],
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(DomainError);
        expect((e as DomainError).code).toBe('ANTHROPIC_AUTH_FAILED');
      }
    });

    it('throws ANTHROPIC_RATE_LIMITED on 429', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({}),
      });

      try {
        await provider.createChatCompletion({
          apiKey: 'sk-test',
          modelId: 'claude-sonnet-4-5-20250929',
          messages: [{ role: 'user', content: 'Hi' }],
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(DomainError);
        expect((e as DomainError).code).toBe('ANTHROPIC_RATE_LIMITED');
      }
    });

    it('throws LLM_EMPTY_RESPONSE when stream has no content', async () => {
      const stream = createSSEStream([
        sseEvent({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }),
      ]);
      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      await expect(
        provider.createChatCompletion({
          apiKey: 'sk-test',
          modelId: 'claude-sonnet-4-5-20250929',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow(DomainError);
    });

    it('throws on stream error event', async () => {
      const stream = createSSEStream([
        sseEvent({ type: 'error', error: { message: 'overloaded' } }),
      ]);
      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      await expect(
        provider.createChatCompletion({
          apiKey: 'sk-test',
          modelId: 'claude-sonnet-4-5-20250929',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow('overloaded');
    });

    it('maps max_tokens stop reason to length', async () => {
      const stream = createSSEStream([
        sseEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'truncated' } }),
        sseEvent({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }),
      ]);
      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      const result = await provider.createChatCompletion({
        apiKey: 'sk-test',
        modelId: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.finishReason).toBe('length');
    });
  });
});
