import { useState, useEffect, useRef } from 'react';

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

const BASE_POLL_MS = 5000;
const MAX_POLL_MS = 60000;
const MAX_CONSECUTIVE_ERRORS = 5;

export default function MemoryIndicator({
  conversationId,
}: MemoryIndicatorProps): React.JSX.Element | null {
  const [memories, setMemories] = useState<ApprovalMemoryEntry[]>([]);
  const [hasError, setHasError] = useState(false);
  const consecutiveErrorsRef = useRef(0);
  const pollIntervalRef = useRef(BASE_POLL_MS);

  // Initial fetch
  useEffect(() => {
    if (!conversationId) {
      setMemories([]);
      setHasError(false);
      consecutiveErrorsRef.current = 0;
      pollIntervalRef.current = BASE_POLL_MS;
      return;
    }

    let cancelled = false;
    window.nswot.approvalMemory
      .list(conversationId)
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          setMemories(result.data.filter((m) => m.allowed));
          setHasError(false);
          consecutiveErrorsRef.current = 0;
        }
      })
      .catch(() => {
        if (!cancelled) consecutiveErrorsRef.current += 1;
      });

    return () => { cancelled = true; };
  }, [conversationId]);

  // Polling with exponential backoff on errors
  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    function schedulePoll(): void {
      timeoutId = setTimeout(async () => {
        if (cancelled) return;
        try {
          const result = await window.nswot.approvalMemory.list(conversationId!);
          if (cancelled) return;
          if (result.success && result.data) {
            setMemories(result.data.filter((m) => m.allowed));
            setHasError(false);
            consecutiveErrorsRef.current = 0;
            pollIntervalRef.current = BASE_POLL_MS;
          } else {
            consecutiveErrorsRef.current += 1;
          }
        } catch {
          if (cancelled) return;
          consecutiveErrorsRef.current += 1;
        }

        if (cancelled) return;

        if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
          setHasError(true);
          return;
        }

        if (consecutiveErrorsRef.current > 0) {
          pollIntervalRef.current = Math.min(
            BASE_POLL_MS * Math.pow(2, consecutiveErrorsRef.current),
            MAX_POLL_MS,
          );
        }

        schedulePoll();
      }, pollIntervalRef.current);
    }

    schedulePoll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [conversationId]);

  if (hasError) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-red-800/30 bg-red-950/10 px-2 py-1">
        <span className="text-[10px] text-red-400/70">Approval memory unavailable</span>
      </div>
    );
  }

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
