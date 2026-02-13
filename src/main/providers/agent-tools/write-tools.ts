import type { ActionToolDefinition } from '../actions/action-tools';
import { CHAT_ACTION_TOOLS, FILE_WRITE_TOOLS } from '../actions/action-tools';

/**
 * Write tool definitions for the agent harness.
 *
 * Write tools require user approval (or auto-approved via approval memory).
 * This module re-exports the Phase 3c action tools (Jira, Confluence, GitHub,
 * file write) and adds the new `write_file` tool for general local file generation.
 *
 * See docs/18 Section 2.2 for the full write tool taxonomy.
 */

/** General-purpose file write tool (new in Phase 4). */
export const WRITE_FILE_TOOL: ActionToolDefinition = {
  type: 'function',
  function: {
    name: 'write_file',
    description:
      'Write a file to the user\'s workspace. Supports any text format (markdown, CSV, JSON, YAML, etc.). The user will review the content and approve before writing. Path is relative to the workspace root.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Workspace-relative file path (e.g., "reports/analysis.md", "data/export.json")',
        },
        content: {
          type: 'string',
          description: 'File content to write',
        },
      },
      required: ['path', 'content'],
    },
  },
};

/**
 * All write tools for the agent harness.
 *
 * Combines:
 * - Phase 3c chat action tools (create_jira_issue, etc.)
 * - Phase 3c file write tools (write_markdown_file, write_csv_file, write_mermaid_file)
 * - Phase 4 general write_file tool
 */
export const WRITE_TOOLS: ActionToolDefinition[] = [
  ...CHAT_ACTION_TOOLS,
  ...FILE_WRITE_TOOLS,
  WRITE_FILE_TOOL,
];

export const WRITE_TOOL_NAMES = WRITE_TOOLS.map((t) => t.function.name);
