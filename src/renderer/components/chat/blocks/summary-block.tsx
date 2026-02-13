import Markdown from 'react-markdown';
import type { SummaryCardsBlockData } from '../../../../main/domain/content-block.types';

interface SummaryBlockProps {
  data: SummaryCardsBlockData;
}

export default function SummaryBlock({ data }: SummaryBlockProps): React.JSX.Element {
  const cards: [string, string | null][] = [
    ['Stakeholder Themes', data.profiles],
    ['Jira Patterns', data.jira],
    ['Confluence Patterns', data.confluence],
    ['GitHub Patterns', data.github],
    ['Codebase Patterns', data.codebase],
  ];

  const visibleCards = cards.filter(([, content]) => content != null) as [string, string][];

  return (
    <div className="my-3 space-y-2">
      <h4 className="text-sm font-bold text-gray-200">Source Summaries</h4>
      <div className="grid grid-cols-2 gap-2">
        {visibleCards.map(([title, content]) => (
          <div key={title} className="rounded-lg border border-gray-800 bg-gray-900 p-3">
            <h5 className="mb-1 text-xs font-medium text-gray-300">{title}</h5>
            <div className="prose prose-sm prose-invert max-w-none text-gray-400 prose-headings:text-gray-300 prose-strong:text-gray-300 prose-li:text-gray-400 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
              <Markdown>{content}</Markdown>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
