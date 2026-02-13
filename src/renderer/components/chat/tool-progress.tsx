import type { ToolActivity } from '../../hooks/use-agent';

interface ToolProgressProps {
  activity: ToolActivity;
}

const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
  fetch_jira_data: { label: 'Fetching Jira data', icon: 'J' },
  fetch_confluence_data: { label: 'Fetching Confluence data', icon: 'C' },
  fetch_github_data: { label: 'Fetching GitHub data', icon: 'G' },
  run_codebase_analysis: { label: 'Analyzing codebase', icon: 'CB' },
  search_profiles: { label: 'Searching profiles', icon: 'P' },
  render_swot_analysis: { label: 'Rendering SWOT analysis', icon: 'SW' },
  render_summary_cards: { label: 'Rendering summaries', icon: 'SM' },
  render_quality_metrics: { label: 'Rendering quality metrics', icon: 'QM' },
  render_mermaid: { label: 'Rendering diagram', icon: 'D' },
  render_chart: { label: 'Rendering chart', icon: 'CH' },
  render_data_table: { label: 'Rendering table', icon: 'TB' },
  render_comparison: { label: 'Rendering comparison', icon: 'CP' },
};

const SOURCE_COLORS: Record<string, string> = {
  fetch_jira_data: 'border-green-800/50 bg-green-950/30 text-green-400',
  fetch_confluence_data: 'border-yellow-800/50 bg-yellow-950/30 text-yellow-400',
  fetch_github_data: 'border-purple-800/50 bg-purple-950/30 text-purple-400',
  run_codebase_analysis: 'border-pink-800/50 bg-pink-950/30 text-pink-400',
  search_profiles: 'border-blue-800/50 bg-blue-950/30 text-blue-400',
};

export default function ToolProgress({ activity }: ToolProgressProps): React.JSX.Element {
  const meta = TOOL_LABELS[activity.toolName];
  const label = meta?.label ?? activity.toolName;
  const icon = meta?.icon ?? 'T';
  const colorClass = SOURCE_COLORS[activity.toolName] ?? 'border-gray-700/50 bg-gray-800/30 text-gray-400';

  return (
    <div className={`my-2 flex items-center gap-2 rounded-lg border px-3 py-2 ${colorClass}`}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gray-800/50 text-[9px] font-bold">
        {icon}
      </span>
      <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
      <span className="text-xs font-medium">{label}...</span>
      {activity.message && (
        <span className="ml-auto text-[10px] opacity-70">{activity.message}</span>
      )}
    </div>
  );
}
