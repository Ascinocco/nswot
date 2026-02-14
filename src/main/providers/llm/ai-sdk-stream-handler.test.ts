import { describe, it, expect } from 'vitest';
import { convertMessages, convertTools, mapFinishReason } from './ai-sdk-stream-handler';

describe('convertMessages', () => {
  it('converts system message', () => {
    const result = convertMessages([{ role: 'system', content: 'You are helpful.' }]);
    expect(result).toEqual([{ role: 'system', content: 'You are helpful.' }]);
  });

  it('converts user message', () => {
    const result = convertMessages([{ role: 'user', content: 'Hello' }]);
    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('converts assistant message without tool calls', () => {
    const result = convertMessages([{ role: 'assistant', content: 'Hi there' }]);
    expect(result).toEqual([{ role: 'assistant', content: 'Hi there' }]);
  });

  it('converts assistant message with tool calls', () => {
    const result = convertMessages([
      {
        role: 'assistant',
        content: 'Let me check',
        tool_calls: [
          {
            id: 'call_1',
            function: { name: 'create_issue', arguments: '{"title":"bug"}' },
          },
        ],
      },
    ]);
    expect(result).toHaveLength(1);
    const msg = result[0]!;
    expect(msg.role).toBe('assistant');
    expect(Array.isArray(msg.content)).toBe(true);
    const parts = msg.content as unknown[];
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ type: 'text', text: 'Let me check' });
    expect(parts[1]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'call_1',
      toolName: 'create_issue',
      input: { title: 'bug' },
    });
  });

  it('converts tool result message', () => {
    const result = convertMessages([
      { role: 'tool', content: '{"status":"done"}', tool_call_id: 'call_1' },
    ]);
    expect(result).toHaveLength(1);
    const msg = result[0]!;
    expect(msg.role).toBe('tool');
    const content = msg.content as unknown[];
    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({
      type: 'tool-result',
      toolCallId: 'call_1',
    });
  });

  it('handles missing content gracefully', () => {
    const result = convertMessages([{ role: 'user' }]);
    expect(result).toEqual([{ role: 'user', content: '' }]);
  });
});

describe('convertTools', () => {
  it('converts OpenAI-style tool definitions', () => {
    const tools = [
      {
        type: 'function',
        function: {
          name: 'create_issue',
          description: 'Create a Jira issue',
          parameters: { type: 'object', properties: { title: { type: 'string' } } },
        },
      },
    ];
    const result = convertTools(tools);
    expect(result).toHaveProperty('create_issue');
    expect(result['create_issue']).toHaveProperty('description', 'Create a Jira issue');
  });

  it('skips non-function tools', () => {
    const tools = [{ type: 'other', name: 'foo' }];
    const result = convertTools(tools);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('handles tools with no parameters', () => {
    const tools = [
      { type: 'function', function: { name: 'list_items' } },
    ];
    const result = convertTools(tools);
    expect(result).toHaveProperty('list_items');
  });
});

describe('mapFinishReason', () => {
  it('maps tool-calls to tool_calls', () => {
    expect(mapFinishReason('tool-calls')).toBe('tool_calls');
  });

  it('passes through stop', () => {
    expect(mapFinishReason('stop')).toBe('stop');
  });

  it('passes through length', () => {
    expect(mapFinishReason('length')).toBe('length');
  });

  it('passes through error', () => {
    expect(mapFinishReason('error')).toBe('error');
  });
});
