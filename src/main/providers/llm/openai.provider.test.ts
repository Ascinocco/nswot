import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from './openai.provider';
import { DomainError } from '../../domain/errors';

// Mock AI SDK modules
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((modelId: string) => ({ modelId, provider: 'openai' }))),
}));

vi.mock('ai', () => ({
  streamText: vi.fn(),
  tool: vi.fn((def: unknown) => def),
}));

import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

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

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider();
    vi.mocked(createOpenAI).mockReturnValue(
      vi.fn((modelId: string) => ({ modelId, provider: 'openai' })) as unknown as ReturnType<typeof createOpenAI>,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listModels', () => {
    it('returns hardcoded OpenAI model list', async () => {
      const models = await provider.listModels('sk-test');
      expect(models.length).toBeGreaterThan(0);
      const ids = models.map((m) => m.id);
      expect(ids).toContain('gpt-4o');
      expect(ids).toContain('gpt-4o-mini');
      expect(ids).toContain('o3-mini');
      expect(ids).toContain('o4-mini');
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
        modelId: 'gpt-4o',
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
        modelId: 'gpt-4o',
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
            input: { title: 'bug' },
          },
          { type: 'finish', finishReason: 'tool-calls', totalUsage: {} },
        ]),
      } as ReturnType<typeof streamText>);

      const result = await provider.createChatCompletion({
        apiKey: 'sk-test',
        modelId: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [{ type: 'function', function: { name: 'create_issue', parameters: {} } }],
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        id: 'call_1',
        name: 'create_issue',
        arguments: '{"title":"bug"}',
      });
      expect(result.finishReason).toBe('tool_calls');
    });

    it('throws OPENAI_AUTH_FAILED on 401', async () => {
      const apiError = new Error('invalid api key') as Error & { statusCode: number };
      apiError.statusCode = 401;

      vi.mocked(streamText).mockImplementation(() => {
        throw apiError;
      });

      try {
        await provider.createChatCompletion({
          apiKey: 'sk-bad',
          modelId: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hi' }],
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(DomainError);
        expect((e as DomainError).code).toBe('OPENAI_AUTH_FAILED');
      }
    });

    it('throws OPENAI_RATE_LIMITED on 429', async () => {
      const apiError = new Error('rate limited') as Error & { statusCode: number };
      apiError.statusCode = 429;

      vi.mocked(streamText).mockImplementation(() => {
        throw apiError;
      });

      try {
        await provider.createChatCompletion({
          apiKey: 'sk-test',
          modelId: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hi' }],
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(DomainError);
        expect((e as DomainError).code).toBe('OPENAI_RATE_LIMITED');
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
          modelId: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow(DomainError);
    });
  });
});
