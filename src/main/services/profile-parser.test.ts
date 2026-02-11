import { describe, it, expect } from 'vitest';
import { parseProfileMarkdown } from './profile-parser';
import { DomainError } from '../domain/errors';

describe('parseProfileMarkdown', () => {
  it('parses complete markdown with frontmatter and all sections', () => {
    const content = `---
name: Jane Doe
role: Staff Engineer
team: Platform
---

## Concerns
Scaling issues with the current architecture.

## Priorities
Reliability and observability improvements.

## Quotes
- "We need better monitoring"
- "Scaling is our top priority"

## Notes
Key stakeholder for platform decisions.
`;

    const result = parseProfileMarkdown(content, 'profiles/jane.md');

    expect(result.name).toBe('Jane Doe');
    expect(result.role).toBe('Staff Engineer');
    expect(result.team).toBe('Platform');
    expect(result.concerns).toBe('Scaling issues with the current architecture.');
    expect(result.priorities).toBe('Reliability and observability improvements.');
    expect(result.interviewQuotes).toEqual([
      'We need better monitoring',
      'Scaling is our top priority',
    ]);
    expect(result.notes).toBe('Key stakeholder for platform decisions.');
    expect(result.sourceFile).toBe('profiles/jane.md');
  });

  it('handles missing optional sections', () => {
    const content = `---
name: Bob Smith
---

## Concerns
Some concerns here.
`;

    const result = parseProfileMarkdown(content, 'bob.md');

    expect(result.name).toBe('Bob Smith');
    expect(result.role).toBeUndefined();
    expect(result.team).toBeUndefined();
    expect(result.concerns).toBe('Some concerns here.');
    expect(result.priorities).toBeUndefined();
    expect(result.interviewQuotes).toEqual([]);
    expect(result.notes).toBeUndefined();
  });

  it('handles quotes section with bullet list', () => {
    const content = `---
name: Test User
---

## Quotes
- "First quote"
- "Second quote"
- "Third quote"
`;

    const result = parseProfileMarkdown(content, 'test.md');
    expect(result.interviewQuotes).toEqual(['First quote', 'Second quote', 'Third quote']);
  });

  it('throws on missing name', () => {
    const content = `---
role: Engineer
team: Backend
---

## Concerns
Some concerns.
`;

    expect(() => parseProfileMarkdown(content, 'noname.md')).toThrow(DomainError);
    expect(() => parseProfileMarkdown(content, 'noname.md')).toThrow('Missing required "name"');
  });

  it('handles content without frontmatter', () => {
    const content = `## Concerns
Some concerns.
`;

    expect(() => parseProfileMarkdown(content, 'nofm.md')).toThrow(DomainError);
  });

  it('handles empty quotes section', () => {
    const content = `---
name: No Quotes
---

## Quotes

## Notes
Some notes here.
`;

    const result = parseProfileMarkdown(content, 'noquotes.md');
    expect(result.interviewQuotes).toEqual([]);
    expect(result.notes).toBe('Some notes here.');
  });
});
