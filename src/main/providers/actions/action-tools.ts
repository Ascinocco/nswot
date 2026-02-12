export interface ActionToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export const CHAT_ACTION_TOOLS: ActionToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_jira_issue',
      description:
        'Create a Jira issue (epic, story, task, or bug). The user will review and approve before creation.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Jira project key (e.g., "PROJ")' },
          issueType: {
            type: 'string',
            enum: ['Epic', 'Story', 'Task', 'Bug'],
            description: 'Type of issue to create',
          },
          summary: { type: 'string', description: 'Issue title/summary' },
          description: { type: 'string', description: 'Issue description in markdown' },
          priority: {
            type: 'string',
            enum: ['Highest', 'High', 'Medium', 'Low', 'Lowest'],
            description: 'Issue priority',
          },
          labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels' },
          parentKey: {
            type: 'string',
            description: 'Parent epic key for stories/tasks (optional)',
          },
        },
        required: ['project', 'issueType', 'summary', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_jira_issues',
      description:
        'Create multiple related Jira issues at once (e.g., an epic with child stories). The user will review and approve before creation.',
      parameters: {
        type: 'object',
        properties: {
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                project: { type: 'string' },
                issueType: { type: 'string', enum: ['Epic', 'Story', 'Task', 'Bug'] },
                summary: { type: 'string' },
                description: { type: 'string' },
                priority: { type: 'string' },
                labels: { type: 'array', items: { type: 'string' } },
                parentRef: {
                  type: 'string',
                  description:
                    'Reference to another issue in this batch by index (e.g., "0" to link to the first issue)',
                },
              },
              required: ['project', 'issueType', 'summary', 'description'],
            },
          },
        },
        required: ['issues'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_jira_comment',
      description:
        'Add a comment to an existing Jira issue. The user will review and approve before posting.',
      parameters: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Jira issue key (e.g., "PROJ-123")' },
          comment: { type: 'string', description: 'Comment body in markdown' },
        },
        required: ['issueKey', 'comment'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_confluence_page',
      description:
        'Create a Confluence page. The user will review and approve before creation.',
      parameters: {
        type: 'object',
        properties: {
          space: { type: 'string', description: 'Confluence space key' },
          title: { type: 'string', description: 'Page title' },
          content: { type: 'string', description: 'Page content in markdown' },
          parentPageId: { type: 'string', description: 'Parent page ID (optional)' },
        },
        required: ['space', 'title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_github_issue',
      description:
        'Create a GitHub issue. The user will review and approve before creation.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository full name (e.g., "owner/repo")' },
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue body in markdown' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels' },
        },
        required: ['repo', 'title', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_github_pr',
      description:
        'Create a GitHub pull request. The user will review and approve before creation.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository full name (e.g., "owner/repo")' },
          title: { type: 'string', description: 'PR title' },
          body: { type: 'string', description: 'PR description in markdown' },
          head: { type: 'string', description: 'Head branch name' },
          base: { type: 'string', description: 'Base branch name (e.g., "main")' },
        },
        required: ['repo', 'title', 'body', 'head', 'base'],
      },
    },
  },
];

export const FILE_WRITE_TOOLS: ActionToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'write_markdown_file',
      description:
        'Write a markdown (.md) file to the user\'s workspace. The user will review and approve before writing. Path is relative to the workspace root.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative file path (e.g., "reports/swot-summary.md")' },
          content: { type: 'string', description: 'File content in markdown' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_csv_file',
      description:
        'Write a CSV (.csv) file to the user\'s workspace. The user will review and approve before writing. Path is relative to the workspace root.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative file path (e.g., "exports/findings.csv")' },
          content: { type: 'string', description: 'CSV content with header row' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_mermaid_file',
      description:
        'Write a Mermaid diagram (.mmd) file to the user\'s workspace. The user will review and approve before writing. Path is relative to the workspace root.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative file path (e.g., "diagrams/architecture.mmd")' },
          content: { type: 'string', description: 'Mermaid diagram syntax' },
        },
        required: ['path', 'content'],
      },
    },
  },
];

export const FILE_WRITE_TOOL_NAMES = FILE_WRITE_TOOLS.map((t) => t.function.name);

export function isFileWriteTool(toolName: string): boolean {
  return FILE_WRITE_TOOL_NAMES.includes(toolName);
}

export const TOOL_NAMES = CHAT_ACTION_TOOLS.map((t) => t.function.name);

export function getToolsByIntegration(connectedIntegrations: string[]): ActionToolDefinition[] {
  const tools: ActionToolDefinition[] = [];
  if (connectedIntegrations.includes('jira')) {
    tools.push(CHAT_ACTION_TOOLS[0]!, CHAT_ACTION_TOOLS[1]!, CHAT_ACTION_TOOLS[2]!);
  }
  if (connectedIntegrations.includes('confluence')) {
    tools.push(CHAT_ACTION_TOOLS[3]!);
  }
  if (connectedIntegrations.includes('github')) {
    tools.push(CHAT_ACTION_TOOLS[4]!, CHAT_ACTION_TOOLS[5]!);
  }
  return tools;
}
