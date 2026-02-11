import { describe, it, expect } from 'vitest';
import { extractTextFromAdf } from './adf';

describe('extractTextFromAdf', () => {
  it('returns empty string for null/undefined', () => {
    expect(extractTextFromAdf(null)).toBe('');
    expect(extractTextFromAdf(undefined)).toBe('');
  });

  it('returns string as-is', () => {
    expect(extractTextFromAdf('plain text')).toBe('plain text');
  });

  it('extracts text from simple ADF paragraph', () => {
    const adf = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello world' },
          ],
        },
      ],
    };
    expect(extractTextFromAdf(adf)).toBe('Hello world');
  });

  it('extracts text from multiple paragraphs', () => {
    const adf = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First paragraph' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Second paragraph' }],
        },
      ],
    };
    expect(extractTextFromAdf(adf)).toBe('First paragraphSecond paragraph');
  });

  it('handles mixed inline content', () => {
    const adf = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world', marks: [{ type: 'strong' }] },
          ],
        },
      ],
    };
    expect(extractTextFromAdf(adf)).toBe('Hello world');
  });

  it('returns empty string for empty object', () => {
    expect(extractTextFromAdf({})).toBe('');
  });
});
