import type { ActionToolDefinition } from '../actions/action-tools';

/**
 * Read tool definitions for the agent harness.
 *
 * Read tools fetch data from existing providers and repositories.
 * They never require user approval. The harness executes them directly
 * and feeds results back as tool_result to the LLM.
 *
 * 5 read tools as specified in docs/18 Section 2.2.
 * OpenAI function schema format, extends ActionToolDefinition.
 */

export const READ_TOOLS: ActionToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'fetch_jira_data',
      description:
        'Fetch Jira data for the current workspace. Returns project, epic, story, and comment summaries. Use when the user asks about Jira issues or when you need additional Jira context.',
      parameters: {
        type: 'object',
        properties: {
          projectKeys: {
            type: 'array',
            items: { type: 'string' },
            description: 'Jira project keys to query (e.g., ["PROJ", "INFRA"]). If empty, uses workspace defaults.',
          },
          query: {
            type: 'string',
            description: 'Optional JQL filter or keyword to narrow results',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_confluence_data',
      description:
        'Fetch Confluence data for the current workspace. Returns page and comment summaries. Use when the user asks about documentation or design docs.',
      parameters: {
        type: 'object',
        properties: {
          spaceKeys: {
            type: 'array',
            items: { type: 'string' },
            description: 'Confluence space keys to query. If empty, uses workspace defaults.',
          },
          query: {
            type: 'string',
            description: 'Optional search query to filter pages',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_github_data',
      description:
        'Fetch GitHub data for the current workspace. Returns PR, issue, and comment summaries. Use when the user asks about code changes, pull requests, or GitHub issues.',
      parameters: {
        type: 'object',
        properties: {
          repos: {
            type: 'array',
            items: { type: 'string' },
            description: 'GitHub repos in "owner/repo" format. If empty, uses workspace defaults.',
          },
          query: {
            type: 'string',
            description: 'Optional search query to filter results',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_codebase_analysis',
      description:
        'Run codebase analysis on a repository. Returns architectural findings, code quality signals, and structural patterns. Use when the user asks about code architecture or technical debt.',
      parameters: {
        type: 'object',
        properties: {
          repos: {
            type: 'array',
            items: { type: 'string' },
            description: 'Repos in "owner/repo" format. If empty, uses workspace defaults.',
          },
          focus: {
            type: 'string',
            description: 'Optional focus area (e.g., "error handling", "testing patterns", "API design")',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_profiles',
      description:
        'Search stakeholder profiles in the current workspace. Returns matching profile data including roles, concerns, priorities, and interview quotes. Use when the user asks about specific stakeholders or needs additional interview context.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query to match against profile name, role, team, concerns, or tags',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by profile tags',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_jira_projects',
      description:
        'List all available Jira projects. Returns project key, name, and type. Use this to discover available projects before fetching data or creating issues.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_confluence_spaces',
      description:
        'List all available Confluence spaces. Returns space key, name, and type. Use this to discover available spaces before fetching pages or creating content.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

export const READ_TOOL_NAMES = READ_TOOLS.map((t) => t.function.name);
