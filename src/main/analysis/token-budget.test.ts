import { describe, it, expect } from 'vitest';
import { calculateTokenBudget, estimateTokens, trimToTokenBudget } from './token-budget';

describe('token-budget', () => {
  describe('calculateTokenBudget', () => {
    it('allocates budget proportionally', () => {
      const budget = calculateTokenBudget(100_000, ['jira']);

      expect(budget.total).toBe(100_000);
      expect(budget.outputReserve).toBe(Math.floor(100_000 * 0.15));
      // available = 100000 - 15000 - 500 - 500 = 84000
      expect(budget.profiles).toBe(Math.floor(84000 * 0.3));
      expect(budget.jiraData).toBe(Math.floor(84000 * 0.6));
      expect(budget.buffer).toBe(Math.floor(84000 * 0.1));
    });

    it('gives zero budget to unconnected sources', () => {
      const budget = calculateTokenBudget(100_000);
      expect(budget.jiraData).toBe(0);
      expect(budget.confluenceData).toBe(0);
      expect(budget.githubData).toBe(0);
      expect(budget.codebaseData).toBe(0);
    });

    it('splits source budget equally among connected sources including codebase', () => {
      const budget = calculateTokenBudget(100_000, ['jira', 'codebase']);
      // available = 100000 - 15000 - 500 - 500 = 84000
      // sourceBudget = 84000 * 0.6 = 50400
      // perSource = 50400 / 2 = 25200
      expect(budget.jiraData).toBe(Math.floor(84000 * 0.6 / 2));
      expect(budget.codebaseData).toBe(Math.floor(84000 * 0.6 / 2));
      expect(budget.confluenceData).toBe(0);
      expect(budget.githubData).toBe(0);
    });

    it('caps output reserve at 15% for small models', () => {
      const budget = calculateTokenBudget(8192);

      expect(budget.outputReserve).toBe(Math.floor(8192 * 0.15));
    });

    it('caps output reserve at 16384 for large models', () => {
      const budget = calculateTokenBudget(200_000);

      expect(budget.outputReserve).toBe(16384);
    });
  });

  describe('estimateTokens', () => {
    it('estimates roughly 1 token per 3 characters', () => {
      const text = 'a'.repeat(300);
      expect(estimateTokens(text)).toBe(100);
    });

    it('rounds up', () => {
      expect(estimateTokens('ab')).toBe(1);
    });
  });

  describe('trimToTokenBudget', () => {
    it('returns text unchanged if within budget', () => {
      const text = 'Hello, world!';
      expect(trimToTokenBudget(text, 100)).toBe(text);
    });

    it('trims text exceeding budget', () => {
      const text = 'a'.repeat(1000);
      const trimmed = trimToTokenBudget(text, 10); // 10 tokens = 30 chars
      expect(trimmed.length).toBeLessThan(text.length);
      expect(trimmed).toContain('[...truncated]');
    });
  });
});
