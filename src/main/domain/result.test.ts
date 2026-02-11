import { describe, it, expect } from 'vitest';
import { ok, err, match } from './result';

describe('Result', () => {
  describe('ok()', () => {
    it('creates a success result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.value).toBe(42);
    });

    it('works with complex types', () => {
      const result = ok({ name: 'test', items: [1, 2, 3] });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.value).toEqual({ name: 'test', items: [1, 2, 3] });
    });
  });

  describe('err()', () => {
    it('creates a failure result', () => {
      const error = new Error('something failed');
      const result = err(error);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected err');
      expect(result.error).toBe(error);
    });

    it('works with string errors', () => {
      const result = err('not found');
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected err');
      expect(result.error).toBe('not found');
    });
  });

  describe('match()', () => {
    it('calls ok handler for success result', () => {
      const result = ok(10);
      const output = match(result, {
        ok: (v) => `value: ${v}`,
        err: (e) => `error: ${e}`,
      });
      expect(output).toBe('value: 10');
    });

    it('calls err handler for failure result', () => {
      const result = err('oops');
      const output = match(result, {
        ok: (v) => `value: ${v}`,
        err: (e) => `error: ${e}`,
      });
      expect(output).toBe('error: oops');
    });

    it('can transform result types', () => {
      const result = ok(5);
      const doubled = match(result, {
        ok: (v) => v * 2,
        err: () => 0,
      });
      expect(doubled).toBe(10);
    });
  });
});
