import { useState, useCallback } from 'react';

interface ApprovalCardProps {
  action: ChatAction;
  onApprove: (actionId: string) => void;
  onApproveAndRemember?: (actionId: string) => void;
  onReject: (actionId: string) => void;
  onEdit: (actionId: string, editedInput: Record<string, unknown>) => void;
  isApproving: boolean;
  isRejecting: boolean;
  isEditing: boolean;
}

const TOOL_LABELS: Record<ActionToolName, string> = {
  create_jira_issue: 'Create Jira Issue',
  create_jira_issues: 'Create Jira Issues',
  add_jira_comment: 'Add Jira Comment',
  create_confluence_page: 'Create Confluence Page',
  create_github_issue: 'Create GitHub Issue',
  create_github_pr: 'Create GitHub PR',
  write_markdown_file: 'Write Markdown File',
  write_csv_file: 'Write CSV File',
  write_mermaid_file: 'Write Mermaid Diagram',
  fetch_jira_data: 'Fetch Jira Data',
  fetch_confluence_data: 'Fetch Confluence Data',
  fetch_github_data: 'Fetch GitHub Data',
  run_codebase_analysis: 'Run Codebase Analysis',
  search_profiles: 'Search Profiles',
  render_swot_analysis: 'Render SWOT Analysis',
  render_mermaid: 'Render Diagram',
  render_chart: 'Render Chart',
  render_data_table: 'Render Data Table',
  write_file: 'Write File',
};

const TOOL_ICONS: Record<ActionToolName, string> = {
  create_jira_issue: 'J',
  create_jira_issues: 'J+',
  add_jira_comment: 'Jc',
  create_confluence_page: 'C',
  create_github_issue: 'GH',
  create_github_pr: 'PR',
  write_markdown_file: 'MD',
  write_csv_file: 'CSV',
  write_mermaid_file: 'MMD',
  fetch_jira_data: 'J',
  fetch_confluence_data: 'C',
  fetch_github_data: 'GH',
  run_codebase_analysis: 'CB',
  search_profiles: 'P',
  render_swot_analysis: 'SW',
  render_mermaid: 'MM',
  render_chart: 'CH',
  render_data_table: 'DT',
  write_file: 'F',
};

const inputClasses =
  'w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none';
const textareaClasses =
  'w-full resize-y rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none';

function FieldRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex gap-2 text-xs">
      <span className="shrink-0 font-medium text-gray-400">{label}:</span>
      <span className="text-gray-300">{value}</span>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}): React.JSX.Element {
  return (
    <div className="space-y-0.5">
      <label className="text-xs font-medium text-gray-400">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={textareaClasses}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClasses}
        />
      )}
    </div>
  );
}

// --- Read-only previews ---

function JiraIssuePreview({ input }: { input: Record<string, unknown> }): React.JSX.Element {
  return (
    <div className="space-y-1">
      <FieldRow label="Project" value={String(input.project ?? '')} />
      <FieldRow label="Type" value={String(input.issueType ?? '')} />
      <FieldRow label="Summary" value={String(input.summary ?? '')} />
      {!!input.priority && <FieldRow label="Priority" value={String(input.priority)} />}
      {!!input.parentKey && <FieldRow label="Parent" value={String(input.parentKey)} />}
      {Array.isArray(input.labels) && input.labels.length > 0 && (
        <FieldRow label="Labels" value={input.labels.join(', ')} />
      )}
      {!!input.description && (
        <div className="mt-1">
          <span className="text-xs font-medium text-gray-400">Description:</span>
          <p className="mt-0.5 max-h-20 overflow-y-auto whitespace-pre-wrap text-xs text-gray-300">
            {String(input.description)}
          </p>
        </div>
      )}
    </div>
  );
}

function JiraBatchPreview({ input }: { input: Record<string, unknown> }): React.JSX.Element {
  const issues = Array.isArray(input.issues) ? input.issues : [];
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-400 hover:text-blue-300"
      >
        {expanded ? 'Collapse' : 'Expand'} {issues.length} issue{issues.length !== 1 ? 's' : ''}
      </button>
      {expanded &&
        issues.map((issue: Record<string, unknown>, i: number) => (
          <div key={i} className="ml-2 border-l border-gray-700 pl-2">
            <p className="text-xs font-medium text-gray-300">
              #{i + 1} [{String(issue.issueType ?? 'Task')}] {String(issue.summary ?? '')}
            </p>
            <FieldRow label="Project" value={String(issue.project ?? '')} />
            {issue.parentRef !== undefined && (
              <FieldRow label="Parent ref" value={`Issue #${String(issue.parentRef)}`} />
            )}
          </div>
        ))}
      {!expanded && issues.length > 0 && (
        <div className="space-y-0.5">
          {issues.map((issue: Record<string, unknown>, i: number) => (
            <p key={i} className="text-xs text-gray-400">
              #{i + 1} [{String(issue.issueType ?? 'Task')}] {String(issue.summary ?? '')}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function JiraCommentPreview({ input }: { input: Record<string, unknown> }): React.JSX.Element {
  return (
    <div className="space-y-1">
      <FieldRow label="Issue" value={String(input.issueKey ?? '')} />
      {!!input.comment && (
        <div className="mt-1">
          <span className="text-xs font-medium text-gray-400">Comment:</span>
          <p className="mt-0.5 max-h-20 overflow-y-auto whitespace-pre-wrap text-xs text-gray-300">
            {String(input.comment)}
          </p>
        </div>
      )}
    </div>
  );
}

function ConfluencePagePreview({ input }: { input: Record<string, unknown> }): React.JSX.Element {
  return (
    <div className="space-y-1">
      <FieldRow label="Space" value={String(input.space ?? '')} />
      <FieldRow label="Title" value={String(input.title ?? '')} />
      {!!input.parentPageId && <FieldRow label="Parent" value={String(input.parentPageId)} />}
      {!!input.content && (
        <div className="mt-1">
          <span className="text-xs font-medium text-gray-400">Content preview:</span>
          <p className="mt-0.5 max-h-20 overflow-y-auto whitespace-pre-wrap text-xs text-gray-300">
            {String(input.content).slice(0, 300)}
            {String(input.content).length > 300 ? '...' : ''}
          </p>
        </div>
      )}
    </div>
  );
}

function GitHubIssuePreview({ input }: { input: Record<string, unknown> }): React.JSX.Element {
  return (
    <div className="space-y-1">
      <FieldRow label="Repo" value={String(input.repo ?? '')} />
      <FieldRow label="Title" value={String(input.title ?? '')} />
      {Array.isArray(input.labels) && input.labels.length > 0 && (
        <FieldRow label="Labels" value={input.labels.join(', ')} />
      )}
      {!!input.body && (
        <div className="mt-1">
          <span className="text-xs font-medium text-gray-400">Body:</span>
          <p className="mt-0.5 max-h-20 overflow-y-auto whitespace-pre-wrap text-xs text-gray-300">
            {String(input.body).slice(0, 300)}
            {String(input.body).length > 300 ? '...' : ''}
          </p>
        </div>
      )}
    </div>
  );
}

function GitHubPRPreview({ input }: { input: Record<string, unknown> }): React.JSX.Element {
  return (
    <div className="space-y-1">
      <FieldRow label="Repo" value={String(input.repo ?? '')} />
      <FieldRow label="Title" value={String(input.title ?? '')} />
      <FieldRow label="Branch" value={`${String(input.head ?? '')} → ${String(input.base ?? '')}`} />
      {!!input.body && (
        <div className="mt-1">
          <span className="text-xs font-medium text-gray-400">Description:</span>
          <p className="mt-0.5 max-h-20 overflow-y-auto whitespace-pre-wrap text-xs text-gray-300">
            {String(input.body).slice(0, 300)}
            {String(input.body).length > 300 ? '...' : ''}
          </p>
        </div>
      )}
    </div>
  );
}

function ToolPreview({ toolName, toolInput }: { toolName: ActionToolName; toolInput: Record<string, unknown> }): React.JSX.Element {
  switch (toolName) {
    case 'create_jira_issue':
      return <JiraIssuePreview input={toolInput} />;
    case 'create_jira_issues':
      return <JiraBatchPreview input={toolInput} />;
    case 'add_jira_comment':
      return <JiraCommentPreview input={toolInput} />;
    case 'create_confluence_page':
      return <ConfluencePagePreview input={toolInput} />;
    case 'create_github_issue':
      return <GitHubIssuePreview input={toolInput} />;
    case 'create_github_pr':
      return <GitHubPRPreview input={toolInput} />;
    default:
      return <FileWritePreview toolName={toolName} input={toolInput} />;
  }
}

function FileWritePreview({ toolName, input }: { toolName: string; input: Record<string, unknown> }): React.JSX.Element {
  const path = String(input['path'] ?? '');
  const content = String(input['content'] ?? '');
  const previewLines = content.split('\n').slice(0, 10).join('\n');
  const truncated = content.split('\n').length > 10;

  return (
    <div className="space-y-2 text-xs">
      <FieldRow label="File" value={path} />
      <FieldRow label="Type" value={toolName.replace('write_', '').replace('_file', '').toUpperCase()} />
      <div>
        <span className="text-xs font-medium text-gray-400">Content preview:</span>
        <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-950 p-2 text-xs text-gray-300">{previewLines}{truncated ? '\n...' : ''}</pre>
      </div>
    </div>
  );
}

// --- Editable forms ---

function JiraIssueEditForm({
  input,
  onChange,
}: {
  input: Record<string, unknown>;
  onChange: (input: Record<string, unknown>) => void;
}): React.JSX.Element {
  const update = (field: string, value: unknown) => onChange({ ...input, [field]: value });

  return (
    <div className="space-y-2">
      <FieldRow label="Project" value={String(input.project ?? '')} />
      <FieldRow label="Type" value={String(input.issueType ?? '')} />
      <EditableField label="Summary" value={String(input.summary ?? '')} onChange={(v) => update('summary', v)} />
      <EditableField label="Description" value={String(input.description ?? '')} onChange={(v) => update('description', v)} multiline />
      <EditableField label="Priority" value={String(input.priority ?? '')} onChange={(v) => update('priority', v)} />
      <EditableField label="Labels (comma-separated)" value={Array.isArray(input.labels) ? input.labels.join(', ') : ''} onChange={(v) => update('labels', v.split(',').map((s) => s.trim()).filter(Boolean))} />
    </div>
  );
}

function JiraCommentEditForm({
  input,
  onChange,
}: {
  input: Record<string, unknown>;
  onChange: (input: Record<string, unknown>) => void;
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <FieldRow label="Issue" value={String(input.issueKey ?? '')} />
      <EditableField label="Comment" value={String(input.comment ?? '')} onChange={(v) => onChange({ ...input, comment: v })} multiline />
    </div>
  );
}

function ConfluencePageEditForm({
  input,
  onChange,
}: {
  input: Record<string, unknown>;
  onChange: (input: Record<string, unknown>) => void;
}): React.JSX.Element {
  const update = (field: string, value: unknown) => onChange({ ...input, [field]: value });

  return (
    <div className="space-y-2">
      <FieldRow label="Space" value={String(input.space ?? '')} />
      <EditableField label="Title" value={String(input.title ?? '')} onChange={(v) => update('title', v)} />
      <EditableField label="Content" value={String(input.content ?? '')} onChange={(v) => update('content', v)} multiline />
    </div>
  );
}

function GitHubIssueEditForm({
  input,
  onChange,
}: {
  input: Record<string, unknown>;
  onChange: (input: Record<string, unknown>) => void;
}): React.JSX.Element {
  const update = (field: string, value: unknown) => onChange({ ...input, [field]: value });

  return (
    <div className="space-y-2">
      <FieldRow label="Repo" value={String(input.repo ?? '')} />
      <EditableField label="Title" value={String(input.title ?? '')} onChange={(v) => update('title', v)} />
      <EditableField label="Body" value={String(input.body ?? '')} onChange={(v) => update('body', v)} multiline />
      <EditableField label="Labels (comma-separated)" value={Array.isArray(input.labels) ? input.labels.join(', ') : ''} onChange={(v) => update('labels', v.split(',').map((s) => s.trim()).filter(Boolean))} />
    </div>
  );
}

function GitHubPREditForm({
  input,
  onChange,
}: {
  input: Record<string, unknown>;
  onChange: (input: Record<string, unknown>) => void;
}): React.JSX.Element {
  const update = (field: string, value: unknown) => onChange({ ...input, [field]: value });

  return (
    <div className="space-y-2">
      <FieldRow label="Repo" value={String(input.repo ?? '')} />
      <EditableField label="Title" value={String(input.title ?? '')} onChange={(v) => update('title', v)} />
      <EditableField label="Description" value={String(input.body ?? '')} onChange={(v) => update('body', v)} multiline />
      <FieldRow label="Branch" value={`${String(input.head ?? '')} → ${String(input.base ?? '')}`} />
    </div>
  );
}

function ToolEditForm({
  toolName,
  toolInput,
  onChange,
}: {
  toolName: ActionToolName;
  toolInput: Record<string, unknown>;
  onChange: (input: Record<string, unknown>) => void;
}): React.JSX.Element {
  switch (toolName) {
    case 'create_jira_issue':
      return <JiraIssueEditForm input={toolInput} onChange={onChange} />;
    case 'create_jira_issues':
      // Batch editing is complex; show read-only for now
      return <JiraBatchPreview input={toolInput} />;
    case 'add_jira_comment':
      return <JiraCommentEditForm input={toolInput} onChange={onChange} />;
    case 'create_confluence_page':
      return <ConfluencePageEditForm input={toolInput} onChange={onChange} />;
    case 'create_github_issue':
      return <GitHubIssueEditForm input={toolInput} onChange={onChange} />;
    case 'create_github_pr':
      return <GitHubPREditForm input={toolInput} onChange={onChange} />;
    default:
      return <FileWritePreview toolName={toolName} input={toolInput} />;
  }
}

export default function ApprovalCard({
  action,
  onApprove,
  onApproveAndRemember,
  onReject,
  onEdit,
  isApproving,
  isRejecting,
  isEditing: isSavingEdit,
}: ApprovalCardProps): React.JSX.Element {
  const [editMode, setEditMode] = useState(false);
  const [editedInput, setEditedInput] = useState<Record<string, unknown>>(action.toolInput);
  const isBusy = isApproving || isRejecting || isSavingEdit;

  const handleStartEdit = useCallback(() => {
    setEditedInput({ ...action.toolInput });
    setEditMode(true);
  }, [action.toolInput]);

  const handleCancelEdit = useCallback(() => {
    setEditMode(false);
    setEditedInput(action.toolInput);
  }, [action.toolInput]);

  const handleSaveEdit = useCallback(() => {
    onEdit(action.id, editedInput);
    setEditMode(false);
  }, [action.id, editedInput, onEdit]);

  return (
    <div className="my-2 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-amber-900/50 text-[10px] font-bold text-amber-300">
          {TOOL_ICONS[action.toolName]}
        </span>
        <span className="text-xs font-semibold text-amber-200">
          {TOOL_LABELS[action.toolName]}
        </span>
        <span className="ml-auto rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-400">
          {editMode ? 'Editing' : 'Pending approval'}
        </span>
      </div>

      {/* Tool-specific preview or edit form */}
      <div className="mb-3 rounded border border-gray-800 bg-gray-950/50 p-2">
        {editMode ? (
          <ToolEditForm toolName={action.toolName} toolInput={editedInput} onChange={setEditedInput} />
        ) : (
          <ToolPreview toolName={action.toolName} toolInput={action.toolInput} />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {editMode ? (
          <>
            <button
              onClick={handleSaveEdit}
              disabled={isBusy}
              className="rounded bg-blue-700 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingEdit ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={isBusy}
              className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onApprove(action.id)}
              disabled={isBusy}
              className="rounded bg-green-700 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isApproving ? 'Creating...' : 'Approve'}
            </button>
            {onApproveAndRemember && (
              <button
                onClick={() => onApproveAndRemember(action.id)}
                disabled={isBusy}
                className="rounded bg-green-800 px-3 py-1 text-xs font-medium text-green-200 transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                title="Approve and auto-approve future actions of this type"
              >
                {isApproving ? 'Creating...' : 'Yes + Remember'}
              </button>
            )}
            <button
              onClick={handleStartEdit}
              disabled={isBusy}
              className="rounded bg-blue-800 px-3 py-1 text-xs font-medium text-blue-200 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Edit
            </button>
            <button
              onClick={() => onReject(action.id)}
              disabled={isBusy}
              className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRejecting ? 'Rejecting...' : 'Reject'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
