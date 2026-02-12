const TOOL_LABELS: Record<ActionToolName, string> = {
  create_jira_issue: 'Jira Issue',
  create_jira_issues: 'Jira Issues',
  add_jira_comment: 'Jira Comment',
  create_confluence_page: 'Confluence Page',
  create_github_issue: 'GitHub Issue',
  create_github_pr: 'GitHub PR',
  write_markdown_file: 'Markdown File',
  write_csv_file: 'CSV File',
  write_mermaid_file: 'Mermaid Diagram',
};

interface ActionStatusProps {
  action: ChatAction;
}

export default function ActionStatus({ action }: ActionStatusProps): React.JSX.Element {
  const label = TOOL_LABELS[action.toolName];

  if (action.status === 'executing' || action.status === 'approved') {
    return (
      <div className="my-1 flex items-center gap-2 rounded bg-gray-800/50 px-3 py-1.5">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
        <span className="text-xs text-gray-400">Creating {label}...</span>
      </div>
    );
  }

  if (action.status === 'completed') {
    const url = action.result?.url;
    const resultId = action.result?.id;
    return (
      <div className="my-1 flex items-center gap-2 rounded bg-green-950/30 px-3 py-1.5">
        <span className="text-green-400">&#10003;</span>
        <span className="text-xs text-green-300">
          {label} created{resultId ? `: ${resultId}` : ''}
        </span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 text-xs text-blue-400 underline hover:text-blue-300"
          >
            Open
          </a>
        )}
      </div>
    );
  }

  if (action.status === 'failed') {
    const errorMsg = action.result?.error ?? 'Unknown error';
    return (
      <div className="my-1 flex items-center gap-2 rounded bg-red-950/30 px-3 py-1.5">
        <span className="text-red-400">&#10007;</span>
        <span className="text-xs text-red-300">
          {label} failed: {errorMsg}
        </span>
      </div>
    );
  }

  if (action.status === 'rejected') {
    return (
      <div className="my-1 flex items-center gap-2 rounded bg-gray-800/50 px-3 py-1.5">
        <span className="text-gray-500">&#10007;</span>
        <span className="text-xs text-gray-500">{label} rejected</span>
      </div>
    );
  }

  // Pending state — handled by ApprovalCard, but just in case
  return (
    <div className="my-1 flex items-center gap-2 rounded bg-amber-950/30 px-3 py-1.5">
      <span className="text-xs text-amber-400">{label} pending approval</span>
    </div>
  );
}
