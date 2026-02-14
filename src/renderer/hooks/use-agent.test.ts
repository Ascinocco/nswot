import { describe, it, expect } from 'vitest';
import { isValidBlock } from './use-agent';

describe('isValidBlock', () => {
  it('accepts a valid text block', () => {
    expect(
      isValidBlock({ type: 'text', id: 'b1', data: { text: 'hello' } }),
    ).toBe(true);
  });

  it('accepts a valid thinking block', () => {
    expect(
      isValidBlock({ type: 'thinking', id: 'b2', data: { thinking: 'hmm' } }),
    ).toBe(true);
  });

  it('accepts all known block types', () => {
    const types = [
      'text', 'thinking', 'swot_analysis', 'summary_cards',
      'quality_metrics', 'mermaid', 'chart', 'data_table',
      'comparison', 'approval', 'action_status',
    ];
    for (const type of types) {
      expect(
        isValidBlock({ type, id: `id-${type}`, data: {} }),
      ).toBe(true);
    }
  });

  it('rejects null', () => {
    expect(isValidBlock(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidBlock(undefined)).toBe(false);
  });

  it('rejects a number', () => {
    expect(isValidBlock(42)).toBe(false);
  });

  it('rejects a string', () => {
    expect(isValidBlock('text')).toBe(false);
  });

  it('rejects an object with unknown type', () => {
    expect(
      isValidBlock({ type: 'bogus_block', id: 'b1', data: {} }),
    ).toBe(false);
  });

  it('rejects an object missing id', () => {
    expect(
      isValidBlock({ type: 'text', data: { text: 'hello' } }),
    ).toBe(false);
  });

  it('rejects an object with non-string id', () => {
    expect(
      isValidBlock({ type: 'text', id: 123, data: { text: 'hello' } }),
    ).toBe(false);
  });

  it('rejects an object missing data', () => {
    expect(
      isValidBlock({ type: 'text', id: 'b1' }),
    ).toBe(false);
  });

  it('rejects an object with non-string type', () => {
    expect(
      isValidBlock({ type: 123, id: 'b1', data: {} }),
    ).toBe(false);
  });

  it('accepts a block where data is null (data !== undefined)', () => {
    // data is present but null — the validator accepts this since data !== undefined
    expect(
      isValidBlock({ type: 'text', id: 'b1', data: null }),
    ).toBe(true);
  });
});
