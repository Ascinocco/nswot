import { useState, useEffect } from 'react';

interface MemoryIndicatorProps {
  conversationId: string | null;
}

interface ApprovalMemoryEntry {
  toolName: string;
  allowed: boolean;
}

const TOOL_SHORT_LABELS: Record<string, string> = {
  create_jira_issue: 'Jira Issue',
  create_jira_issues: 'Jira Issues',
  add_jira_comment: 'Jira Comment',
  create_confluence_page: 'Confluence Page',
  create_github_issue: 'GH Issue',
  create_github_pr: 'GH PR',
  write_markdown_file: 'MD File',
  write_csv_file: 'CSV File',
  write_mermaid_file: 'Mermaid',
  write_file: 'File Write',
};

export default function MemoryIndicator({
  conversationId,
}: MemoryIndicatorProps): React.JSX.Element | null {
  const [memories, setMemories] = useState<ApprovalMemoryEntry[]>([]);

  useEffect(() => {
    if (!conversationId) {
      setMemories([]);
      return;
    }

    window.nswot.approvalMemory
      .list(conversationId)
      .then((result) => {
        if (result.success && result.data) {
          setMemories(result.data.filter((m) => m.allowed));
        }
      })
      .catch(() => {});
  }, [conversationId]);

  // Re-fetch on approval memory changes (poll lightly)
  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(() => {
      window.nswot.approvalMemory
        .list(conversationId)
        .then((result) => {
          if (result.success && result.data) {
            setMemories(result.data.filter((m) => m.allowed));
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [conversationId]);

  if (memories.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-gray-800 bg-gray-900/50 px-2 py-1">
      <span className="text-[10px] text-gray-500">Auto-approved:</span>
      {memories.map((m) => (
        <span
          key={m.toolName}
          className="rounded bg-green-900/30 px-1.5 py-0.5 text-[9px] font-medium text-green-400"
          title={`${m.toolName} is auto-approved for this conversation`}
        >
          {TOOL_SHORT_LABELS[m.toolName] ?? m.toolName}
        </span>
      ))}
    </div>
  );
}
