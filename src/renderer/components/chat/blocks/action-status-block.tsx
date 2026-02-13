import type { ActionStatusBlockData } from '../../../../main/domain/content-block.types';

const TOOL_LABELS: Record<string, string> = {
  create_jira_issue: 'Jira Issue',
  create_jira_issues: 'Jira Issues',
  add_jira_comment: 'Jira Comment',
  create_confluence_page: 'Confluence Page',
  create_github_issue: 'GitHub Issue',
  create_github_pr: 'GitHub PR',
  write_markdown_file: 'Markdown File',
  write_csv_file: 'CSV File',
  write_mermaid_file: 'Mermaid Diagram',
  write_file: 'File',
};

interface ActionStatusBlockProps {
  data: ActionStatusBlockData;
}

export default function ActionStatusBlock({ data }: ActionStatusBlockProps): React.JSX.Element {
  const label = TOOL_LABELS[data.toolName] ?? data.toolName;
  const result = data.result;

  if (data.status === 'rejected') {
    return (
      <div className="my-2 rounded-lg border border-red-800/50 bg-red-950/20 px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
            Rejected
          </span>
          <span className="text-gray-400">{label}</span>
        </div>
      </div>
    );
  }

  if (data.status === 'failed') {
    return (
      <div className="my-2 rounded-lg border border-red-800/50 bg-red-950/20 px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
            Failed
          </span>
          <span className="text-gray-400">{label}</span>
        </div>
        {result?.error && (
          <p className="mt-1 text-[10px] text-red-400">{result.error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-green-800/50 bg-green-950/20 px-3 py-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded bg-green-900/50 px-1.5 py-0.5 text-[10px] font-medium text-green-300">
          Completed
        </span>
        <span className="text-gray-400">{label}</span>
        {result?.url && (
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-blue-400 hover:text-blue-300"
          >
            Open &rarr;
          </a>
        )}
      </div>
      {result?.id && !result.url && (
        <p className="mt-1 text-[10px] text-gray-500">ID: {result.id}</p>
      )}
    </div>
  );
}
