import { describe, it, expect } from 'vitest';
import { calculateTokenBudget, estimateTokens, trimToTokenBudget } from './token-budget';

describe('token-budget', () => {
  describe('calculateTokenBudget', () => {
    it('allocates budget proportionally', () => {
      const budget = calculateTokenBudget(100_000);

      expect(budget.total).toBe(100_000);
      expect(budget.outputReserve).toBe(4096);
      // available = 100000 - 4096 - 500 - 500 = 94904
      expect(budget.profiles).toBe(Math.floor(94904 * 0.4));
      expect(budget.jiraData).toBe(Math.floor(94904 * 0.5));
      expect(budget.buffer).toBe(Math.floor(94904 * 0.1));
    });

    it('caps output reserve at 10% for small models', () => {
      const budget = calculateTokenBudget(8192);

      expect(budget.outputReserve).toBe(819); // 10% of 8192
    });

    it('caps output reserve at 4096 for large models', () => {
      const budget = calculateTokenBudget(200_000);

      expect(budget.outputReserve).toBe(4096);
    });
  });

  describe('estimateTokens', () => {
    it('estimates roughly 1 token per 4 characters', () => {
      const text = 'a'.repeat(400);
      expect(estimateTokens(text)).toBe(100);
    });

    it('rounds up', () => {
      expect(estimateTokens('abc')).toBe(1);
    });
  });

  describe('trimToTokenBudget', () => {
    it('returns text unchanged if within budget', () => {
      const text = 'Hello, world!';
      expect(trimToTokenBudget(text, 100)).toBe(text);
    });

    it('trims text exceeding budget', () => {
      const text = 'a'.repeat(1000);
      const trimmed = trimToTokenBudget(text, 10); // 10 tokens = 40 chars
      expect(trimmed.length).toBeLessThan(text.length);
      expect(trimmed).toContain('[...truncated]');
    });
  });
});
