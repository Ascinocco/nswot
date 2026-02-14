import type { AgentState, TokenCount, ToolActivity } from '../../hooks/use-agent';

interface StatusBarProps {
  agentState: AgentState;
  tokenCount: TokenCount;
  toolActivity: ToolActivity | null;
  onStop: () => void;
  /** Pricing per token (prompt + completion) for cost estimation */
  modelPricing?: { prompt: number; completion: number } | null;
}

const STATE_LABELS: Record<AgentState, string> = {
  idle: 'Ready',
  thinking: 'Thinking...',
  executing_tool: 'Executing tool...',
  awaiting_approval: 'Action needs your approval',
  error: 'Error',
};

const STATE_COLORS: Record<AgentState, string> = {
  idle: 'text-gray-400',
  thinking: 'text-blue-400',
  executing_tool: 'text-yellow-400',
  awaiting_approval: 'text-amber-300',
  error: 'text-red-400',
};

const TOOL_TO_SOURCE: Record<string, string> = {
  fetch_jira_data: 'jira',
  fetch_confluence_data: 'confluence',
  fetch_github_data: 'github',
  run_codebase_analysis: 'codebase',
  search_profiles: 'profiles',
};

const SOURCE_ICON_STYLES: Record<string, { label: string; active: string; inactive: string }> = {
  jira: {
    label: 'Jira',
    active: 'bg-green-900/60 text-green-300 border-green-700',
    inactive: 'bg-gray-800/50 text-gray-600 border-gray-700/50',
  },
  confluence: {
    label: 'Conf',
    active: 'bg-yellow-900/60 text-yellow-300 border-yellow-700',
    inactive: 'bg-gray-800/50 text-gray-600 border-gray-700/50',
  },
  github: {
    label: 'GH',
    active: 'bg-purple-900/60 text-purple-300 border-purple-700',
    inactive: 'bg-gray-800/50 text-gray-600 border-gray-700/50',
  },
  codebase: {
    label: 'Code',
    active: 'bg-pink-900/60 text-pink-300 border-pink-700',
    inactive: 'bg-gray-800/50 text-gray-600 border-gray-700/50',
  },
};

function formatTokenCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}

function formatCost(dollars: number): string {
  if (dollars < 0.01) return '<$0.01';
  if (dollars < 1) return `$${dollars.toFixed(2)}`;
  return `$${dollars.toFixed(2)}`;
}

export default function StatusBar({
  agentState,
  tokenCount,
  toolActivity,
  onStop,
  modelPricing,
}: StatusBarProps): React.JSX.Element {
  const isActive = agentState !== 'idle' && agentState !== 'error';
  const isAwaitingApproval = agentState === 'awaiting_approval';
  const totalTokens = tokenCount.input + tokenCount.output;
  const activeSource = toolActivity ? TOOL_TO_SOURCE[toolActivity.toolName] ?? null : null;

  const costEstimate = modelPricing
    ? tokenCount.input * modelPricing.prompt + tokenCount.output * modelPricing.completion
    : null;

  const borderClass = isAwaitingApproval
    ? 'border-amber-700/60 bg-amber-950/10'
    : 'border-gray-800 bg-gray-900';

  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs ${borderClass}`}>
      {/* Agent state */}
      <div className="flex items-center gap-2">
        {isActive && (
          <span className={`h-2 w-2 animate-pulse rounded-full ${isAwaitingApproval ? 'bg-amber-400' : 'bg-blue-400'}`} />
        )}
        <span className={STATE_COLORS[agentState]}>
          {STATE_LABELS[agentState]}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Source activity icons */}
        {isActive && (
          <div className="flex items-center gap-1">
            {Object.entries(SOURCE_ICON_STYLES).map(([key, styles]) => {
              const isSourceActive = activeSource === key;
              return (
                <span
                  key={key}
                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                    isSourceActive ? styles.active : styles.inactive
                  }`}
                  title={styles.label}
                >
                  {isSourceActive && (
                    <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                  )}
                  {styles.label}
                </span>
              );
            })}
          </div>
        )}

        {/* Token counter + cost */}
        {totalTokens > 0 && (
          <span
            className="text-gray-500"
            title={`Input: ${formatTokenCount(tokenCount.input)} / Output: ${formatTokenCount(tokenCount.output)}${costEstimate != null ? ` / Est. cost: ${formatCost(costEstimate)}` : ''}`}
          >
            ~{formatTokenCount(totalTokens)} tokens
            {costEstimate != null && costEstimate > 0 && (
              <span className="ml-1.5 text-gray-600">({formatCost(costEstimate)})</span>
            )}
          </span>
        )}

        {/* Stop button */}
        {isActive && (
          <button
            onClick={onStop}
            className="rounded border border-red-800 px-2 py-0.5 text-red-400 hover:bg-red-950/50 transition-colors"
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
