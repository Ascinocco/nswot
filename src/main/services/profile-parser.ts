import { DomainError, ERROR_CODES } from '../domain/errors';
import type { ProfileInput } from '../domain/types';

interface FrontMatter {
  name?: string;
  role?: string;
  team?: string;
  tags?: string;
}

function parseFrontMatter(content: string): { frontMatter: FrontMatter; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { frontMatter: {}, body: content };
  }

  const yamlBlock = match[1]!;
  const body = match[2]!;
  const frontMatter: FrontMatter = {};

  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key === 'name') frontMatter.name = value;
    else if (key === 'role') frontMatter.role = value;
    else if (key === 'team') frontMatter.team = value;
    else if (key === 'tags') frontMatter.tags = value;
  }

  return { frontMatter, body };
}

function extractSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const parts = body.split(/^## /m);
  for (const part of parts) {
    const newlineIdx = part.indexOf('\n');
    if (newlineIdx === -1) continue;
    const heading = part.slice(0, newlineIdx).trim();
    const content = part.slice(newlineIdx + 1).trim();
    if (heading) {
      sections[heading] = content;
    }
  }
  return sections;
}

function parseQuotes(section: string | undefined): string[] {
  if (!section) return [];
  const quotes: string[] = [];
  for (const line of section.split('\n')) {
    const match = line.match(/^[-*]\s+"(.+)"$/);
    if (match) {
      quotes.push(match[1]!);
    }
  }
  return quotes;
}

export function parseProfileMarkdown(content: string, sourceFile: string): ProfileInput {
  const { frontMatter, body } = parseFrontMatter(content);

  if (!frontMatter.name) {
    throw new DomainError(
      ERROR_CODES.IMPORT_PARSE_ERROR,
      `Missing required "name" field in frontmatter of ${sourceFile}`,
    );
  }

  const sections = extractSections(body);
  const concerns = sections['Concerns'] || undefined;
  const priorities = sections['Priorities'] || undefined;
  const quotesSection = sections['Quotes'] || undefined;
  const notes = sections['Notes'] || undefined;
  const interviewQuotes = parseQuotes(quotesSection);

  return {
    name: frontMatter.name,
    role: frontMatter.role,
    team: frontMatter.team,
    concerns,
    priorities,
    interviewQuotes,
    notes,
    sourceFile,
    tags: frontMatter.tags
      ? frontMatter.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined,
  };
}
