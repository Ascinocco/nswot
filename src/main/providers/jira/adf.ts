/**
 * Extracts plain text from Jira's Atlassian Document Format (ADF).
 * ADF is a JSON structure returned by Jira REST API v3 for rich text fields
 * like issue descriptions and comment bodies.
 */
export function extractTextFromAdf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';

  const node = value as { type?: string; text?: string; content?: unknown[] };

  if (node.type === 'text' && typeof node.text === 'string') {
    return node.text;
  }

  if (Array.isArray(node.content)) {
    return node.content.map(extractTextFromAdf).join('');
  }

  return '';
}
