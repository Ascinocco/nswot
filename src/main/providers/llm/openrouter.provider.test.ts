import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterProvider } from './openrouter.provider';
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

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new OpenRouterProvider();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listModels', () => {
    it('returns mapped model list', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'openai/gpt-4',
              name: 'GPT-4',
              context_length: 8192,
              pricing: { prompt: '0.03', completion: '0.06' },
            },
          ],
        }),
      });

      const models = await provider.listModels('sk-test');
      expect(models).toHaveLength(1);
      expect(models[0]).toEqual({
        id: 'openai/gpt-4',
        name: 'GPT-4',
        contextLength: 8192,
        pricing: { prompt: 0.03, completion: 0.06 },
      });
    });

    it('throws on non-ok response', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });

      await expect(provider.listModels('sk-bad')).rejects.toThrow();
    });
  });

  describe('createChatCompletion', () => {
    it('streams text content', async () => {
      const stream = createSSEStream([
        sseEvent({ choices: [{ delta: { content: 'Hello' } }] }),
        sseEvent({ choices: [{ delta: { content: ' world' } }] }),
        sseEvent({ choices: [{ finish_reason: 'stop' }] }),
        'data: [DONE]\n\n',
      ]);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        body: stream,
      });

      const result = await provider.createChatCompletion({
        apiKey: 'sk-test',
        modelId: 'openai/gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.content).toBe('Hello world');
      expect(result.finishReason).toBe('stop');
      expect(result.toolCalls).toBeUndefined();
    });

    it('calls onChunk for each text delta', async () => {
      const stream = createSSEStream([
        sseEvent({ choices: [{ delta: { content: 'A' } }] }),
        sseEvent({ choices: [{ delta: { content: 'B' } }] }),
        'data: [DONE]\n\n',
      ]);

      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      const chunks: string[] = [];
      await provider.createChatCompletion({
        apiKey: 'sk-test',
        modelId: 'test',
        messages: [{ role: 'user', content: 'Hi' }],
        onChunk: (c) => chunks.push(c),
      });

      expect(chunks).toEqual(['A', 'B']);
    });

    it('accumulates streaming tool calls', async () => {
      const stream = createSSEStream([
        sseEvent({
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_1',
                function: { name: 'create_issue', arguments: '{"title":' },
              }],
            },
          }],
        }),
        sseEvent({
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                function: { arguments: '"bug fix"}' },
              }],
            },
          }],
        }),
        sseEvent({ choices: [{ finish_reason: 'tool_calls' }] }),
        'data: [DONE]\n\n',
      ]);

      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      const result = await provider.createChatCompletion({
        apiKey: 'sk-test',
        modelId: 'test',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        id: 'call_1',
        name: 'create_issue',
        arguments: '{"title":"bug fix"}',
      });
      expect(result.finishReason).toBe('tool_calls');
    });

    it('passes temperature and maxTokens', async () => {
      const stream = createSSEStream([
        sseEvent({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
        'data: [DONE]\n\n',
      ]);

      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      await provider.createChatCompletion({
        apiKey: 'sk-test',
        modelId: 'test',
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0,
        maxTokens: 8192,
      });

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.temperature).toBe(0);
      expect(body.max_tokens).toBe(8192);
    });

    it('includes tools when provided', async () => {
      const stream = createSSEStream([
        sseEvent({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
        'data: [DONE]\n\n',
      ]);

      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      const tools = [{ type: 'function', function: { name: 'test', parameters: {} } }];
      await provider.createChatCompletion({
        apiKey: 'sk-test',
        modelId: 'test',
        messages: [{ role: 'user', content: 'Hi' }],
        tools,
      });

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.tools).toEqual(tools);
    });

    it('throws LLM_AUTH_FAILED on 401', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'bad key' } }),
      });

      try {
        await provider.createChatCompletion({
          apiKey: 'sk-bad',
          modelId: 'test',
          messages: [{ role: 'user', content: 'Hi' }],
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(DomainError);
        expect((e as DomainError).code).toBe('LLM_AUTH_FAILED');
      }
    });

    it('throws LLM_RATE_LIMITED on 429', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({}),
      });

      try {
        await provider.createChatCompletion({
          apiKey: 'sk-test',
          modelId: 'test',
          messages: [{ role: 'user', content: 'Hi' }],
        });
      } catch (e) {
        expect((e as DomainError).code).toBe('LLM_RATE_LIMITED');
      }
    });

    it('throws LLM_EMPTY_RESPONSE when stream has no content', async () => {
      const stream = createSSEStream(['data: [DONE]\n\n']);
      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      await expect(
        provider.createChatCompletion({
          apiKey: 'sk-test',
          modelId: 'test',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow(DomainError);
    });

    it('throws on inline stream error', async () => {
      const stream = createSSEStream([
        sseEvent({ error: { message: 'model overloaded' } }),
      ]);
      fetchMock.mockResolvedValueOnce({ ok: true, body: stream });

      await expect(
        provider.createChatCompletion({
          apiKey: 'sk-test',
          modelId: 'test',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow('model overloaded');
    });
  });
});
