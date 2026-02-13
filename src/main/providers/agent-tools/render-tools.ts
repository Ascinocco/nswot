import type { ActionToolDefinition } from '../actions/action-tools';

/**
 * Render tool definitions for the agent harness.
 *
 * Render tools produce UI content blocks. They do not call external services
 * and never require user approval. The agent harness intercepts their results,
 * creates ContentBlocks, and returns compact confirmations to the LLM
 * (not the full data — saves context window).
 *
 * 7 render tools as specified in docs/18 Section 2.2.
 * OpenAI function schema format, extends ActionToolDefinition.
 */

export const RENDER_TOOLS: ActionToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'render_swot_analysis',
      description:
        'Display SWOT analysis results as interactive cards in the chat. Use this to present strengths, weaknesses, opportunities, and threats with evidence.',
      parameters: {
        type: 'object',
        properties: {
          strengths: {
            type: 'array',
            items: { type: 'object' },
            description: 'Array of strength items with claim, evidence, impact, recommendation, confidence',
          },
          weaknesses: {
            type: 'array',
            items: { type: 'object' },
            description: 'Array of weakness items',
          },
          opportunities: {
            type: 'array',
            items: { type: 'object' },
            description: 'Array of opportunity items',
          },
          threats: {
            type: 'array',
            items: { type: 'object' },
            description: 'Array of threat items',
          },
        },
        required: ['strengths', 'weaknesses', 'opportunities', 'threats'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'render_summary_cards',
      description:
        'Display data source summaries as cards in the chat. Shows a summary for each data source (profiles, Jira, Confluence, GitHub, codebase).',
      parameters: {
        type: 'object',
        properties: {
          profiles: { type: 'string', description: 'Summary of stakeholder profile data' },
          jira: { type: 'string', description: 'Summary of Jira data' },
          confluence: {
            type: ['string', 'null'],
            description: 'Summary of Confluence data (null if not used)',
          },
          github: {
            type: ['string', 'null'],
            description: 'Summary of GitHub data (null if not used)',
          },
          codebase: {
            type: ['string', 'null'],
            description: 'Summary of codebase analysis data (null if not used)',
          },
        },
        required: ['profiles', 'jira'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'render_quality_metrics',
      description:
        'Display evidence quality metrics in the chat. Shows total items, multi-source items, confidence distribution, and quality score.',
      parameters: {
        type: 'object',
        properties: {
          totalItems: { type: 'number', description: 'Total number of SWOT items' },
          multiSourceItems: {
            type: 'number',
            description: 'Number of items backed by multiple sources',
          },
          sourceTypeCoverage: {
            type: 'object',
            description: 'Map of source type to count of items citing it',
          },
          confidenceDistribution: {
            type: 'object',
            properties: {
              high: { type: 'number' },
              medium: { type: 'number' },
              low: { type: 'number' },
            },
            required: ['high', 'medium', 'low'],
            description: 'Distribution of confidence levels across items',
          },
          averageEvidencePerItem: {
            type: 'number',
            description: 'Average number of evidence entries per item',
          },
          qualityScore: {
            type: 'number',
            description: 'Overall quality score (0-100)',
          },
          sourceCoverage: {
            type: 'array',
            items: { type: 'object' },
            description: 'Per-source coverage entries (optional)',
          },
        },
        required: [
          'totalItems',
          'multiSourceItems',
          'sourceTypeCoverage',
          'confidenceDistribution',
          'averageEvidencePerItem',
          'qualityScore',
        ],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'render_mermaid',
      description:
        'Render a Mermaid diagram inline in the chat. Use this for architecture diagrams, flowcharts, sequence diagrams, etc.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title displayed above the diagram' },
          source: { type: 'string', description: 'Mermaid diagram syntax' },
        },
        required: ['title', 'source'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'render_chart',
      description:
        'Render a chart (bar, line, pie, radar, doughnut) inline in the chat. Use for data visualizations.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Chart title' },
          chartType: {
            type: 'string',
            enum: ['bar', 'line', 'pie', 'radar', 'doughnut'],
            description: 'Type of chart to render',
          },
          spec: {
            type: 'object',
            description: 'Chart specification (labels, datasets, options). Format depends on chart type.',
          },
        },
        required: ['title', 'chartType', 'spec'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'render_data_table',
      description:
        'Render a data table inline in the chat. Use for tabular data such as issue lists, comparison tables, metrics breakdowns.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Table title' },
          headers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Column headers',
          },
          rows: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'string' },
            },
            description: 'Table rows (array of arrays of cell values)',
          },
        },
        required: ['title', 'headers', 'rows'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'render_comparison',
      description:
        'Render a side-by-side comparison of two analyses in the chat. Use when the user asks to compare analysis runs.',
      parameters: {
        type: 'object',
        properties: {
          baseAnalysisId: {
            type: 'string',
            description: 'ID of the base analysis (left side)',
          },
          compareAnalysisId: {
            type: 'string',
            description: 'ID of the analysis to compare against (right side)',
          },
        },
        required: ['baseAnalysisId', 'compareAnalysisId'],
      },
    },
  },
];

export const RENDER_TOOL_NAMES = RENDER_TOOLS.map((t) => t.function.name);
