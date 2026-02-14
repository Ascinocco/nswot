import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterProvider } from './openrouter.provider';
import { DomainError } from '../../domain/errors';

// Mock AI SDK modules
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => ({
    chatModel: vi.fn((modelId: string) => ({ modelId, provider: 'openrouter' })),
  })),
}));

vi.mock('ai', () => ({
  streamText: vi.fn(),
  tool: vi.fn((def: unknown) => def),
}));

import { streamText } from 'ai';

function createMockFullStream(parts: Array<Record<string, unknown>>): AsyncIterable<Record<string, unknown>> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next() {
          if (index < parts.length) {
            return { value: parts[index++]!, done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
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
      vi.mocked(streamText).mockReturnValue({
        fullStream: createMockFullStream([
          { type: 'text-delta', id: '1', text: 'Hello' },
          { type: 'text-delta', id: '2', text: ' world' },
          { type: 'finish', finishReason: 'stop', totalUsage: {} },
        ]),
      } as ReturnType<typeof streamText>);

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
      vi.mocked(streamText).mockReturnValue({
        fullStream: createMockFullStream([
          { type: 'text-delta', id: '1', text: 'A' },
          { type: 'text-delta', id: '2', text: 'B' },
          { type: 'finish', finishReason: 'stop', totalUsage: {} },
        ]),
      } as ReturnType<typeof streamText>);

      const chunks: string[] = [];
      await provider.createChatCompletion({
        apiKey: 'sk-test',
        modelId: 'test',
        messages: [{ role: 'user', content: 'Hi' }],
        onChunk: (c) => chunks.push(c),
      });

      expect(chunks).toEqual(['A', 'B']);
    });

    it('extracts tool calls', async () => {
      vi.mocked(streamText).mockReturnValue({
        fullStream: createMockFullStream([
          {
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'create_issue',
            input: { title: 'bug fix' },
          },
          { type: 'finish', finishReason: 'tool-calls', totalUsage: {} },
        ]),
      } as ReturnType<typeof streamText>);

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

    it('throws LLM_AUTH_FAILED on 401', async () => {
      const apiError = new Error('bad key') as Error & { statusCode: number };
      apiError.statusCode = 401;

      vi.mocked(streamText).mockImplementation(() => {
        throw apiError;
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
      const apiError = new Error('rate limited') as Error & { statusCode: number };
      apiError.statusCode = 429;

      vi.mocked(streamText).mockImplementation(() => {
        throw apiError;
      });

      try {
        await provider.createChatCompletion({
          apiKey: 'sk-test',
          modelId: 'test',
          messages: [{ role: 'user', content: 'Hi' }],
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as DomainError).code).toBe('LLM_RATE_LIMITED');
      }
    });

    it('throws LLM_EMPTY_RESPONSE when stream has no content', async () => {
      vi.mocked(streamText).mockReturnValue({
        fullStream: createMockFullStream([
          { type: 'finish', finishReason: 'stop', totalUsage: {} },
        ]),
      } as ReturnType<typeof streamText>);

      await expect(
        provider.createChatCompletion({
          apiKey: 'sk-test',
          modelId: 'test',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow(DomainError);
    });
  });
});
