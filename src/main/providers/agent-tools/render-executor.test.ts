import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RenderExecutor } from './render-executor';
import { resetBlockIdCounter } from '../../services/agent.service';
import type { ComparisonService } from '../../services/comparison.service';
import { ok, err } from '../../domain/result';
import { DomainError, ERROR_CODES } from '../../domain/errors';
import type { ComparisonResult } from '../../domain/comparison.types';

function makeMockComparisonService(result?: ComparisonResult): ComparisonService {
  if (result) {
    return {
      compare: vi.fn().mockResolvedValue(ok(result)),
    } as unknown as ComparisonService;
  }
  return {
    compare: vi.fn().mockResolvedValue(
      err(new DomainError(ERROR_CODES.ANALYSIS_NOT_FOUND, 'Analysis not found')),
    ),
  } as unknown as ComparisonService;
}

const mockComparisonResult: ComparisonResult = {
  analysisIdA: 'a1',
  analysisIdB: 'a2',
  deltas: [
    { kind: 'added', category: 'strengths', claim: 'New strength' },
  ],
  summary: {
    strengths: { added: 1, removed: 0, changed: 0, unchanged: 0 },
    weaknesses: { added: 0, removed: 0, changed: 0, unchanged: 0 },
    opportunities: { added: 0, removed: 0, changed: 0, unchanged: 0 },
    threats: { added: 0, removed: 0, changed: 0, unchanged: 0 },
    totalAdded: 1,
    totalRemoved: 0,
    totalChanged: 0,
    totalUnchanged: 0,
  },
  createdAt: '2026-02-12T00:00:00.000Z',
};

describe('RenderExecutor', () => {
  let executor: RenderExecutor;
  let comparisonService: ComparisonService;

  beforeEach(() => {
    resetBlockIdCounter();
    comparisonService = makeMockComparisonService(mockComparisonResult);
    executor = new RenderExecutor(comparisonService);
  });

  describe('render_swot_analysis', () => {
    it('produces a swot_analysis content block', async () => {
      const result = await executor.execute('render_swot_analysis', {
        strengths: [{ claim: 'Good CI/CD', evidence: [], impact: 'High', recommendation: 'Keep', confidence: 'high' }],
        weaknesses: [{ claim: 'Tech debt', evidence: [], impact: 'Medium', recommendation: 'Fix', confidence: 'medium' }],
        opportunities: [],
        threats: [],
      });

      expect(result.block).toBeDefined();
      expect(result.block!.type).toBe('swot_analysis');
      expect(result.block!.id).toMatch(/^block-/);
      const data = result.block!.data as { strengths: unknown[]; weaknesses: unknown[] };
      expect(data.strengths).toHaveLength(1);
      expect(data.weaknesses).toHaveLength(1);
    });

    it('returns error for missing required arrays', async () => {
      const result = await executor.execute('render_swot_analysis', {
        strengths: [{ claim: 'test' }],
        // missing weaknesses, opportunities, threats
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('requires strengths, weaknesses, opportunities, and threats arrays');
    });

    it('returns error for non-array fields', async () => {
      const result = await executor.execute('render_swot_analysis', {
        strengths: 'not an array',
        weaknesses: [],
        opportunities: [],
        threats: [],
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('requires');
    });
  });

  describe('render_summary_cards', () => {
    it('produces a summary_cards content block', async () => {
      const result = await executor.execute('render_summary_cards', {
        profiles: 'Summary of 5 stakeholder profiles',
        jira: 'Summary of 3 Jira projects',
        confluence: 'Summary of 2 Confluence spaces',
        github: null,
        codebase: null,
      });

      expect(result.block).toBeDefined();
      expect(result.block!.type).toBe('summary_cards');
      const data = result.block!.data as { profiles: string; jira: string; confluence: string | null };
      expect(data.profiles).toBe('Summary of 5 stakeholder profiles');
      expect(data.jira).toBe('Summary of 3 Jira projects');
      expect(data.confluence).toBe('Summary of 2 Confluence spaces');
    });

    it('defaults optional fields to null', async () => {
      const result = await executor.execute('render_summary_cards', {
        profiles: 'Profiles summary',
        jira: 'Jira summary',
      });

      expect(result.block).toBeDefined();
      const data = result.block!.data as { confluence: string | null; github: string | null; codebase: string | null };
      expect(data.confluence).toBeNull();
      expect(data.github).toBeNull();
      expect(data.codebase).toBeNull();
    });

    it('returns error for missing required fields', async () => {
      const result = await executor.execute('render_summary_cards', {
        profiles: 'Summary',
        // missing jira
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('requires profiles and jira');
    });
  });

  describe('render_quality_metrics', () => {
    it('produces a quality_metrics content block', async () => {
      const result = await executor.execute('render_quality_metrics', {
        totalItems: 20,
        multiSourceItems: 12,
        sourceTypeCoverage: { profile: 18, jira: 15, confluence: 8 },
        confidenceDistribution: { high: 10, medium: 7, low: 3 },
        averageEvidencePerItem: 2.5,
        qualityScore: 78,
      });

      expect(result.block).toBeDefined();
      expect(result.block!.type).toBe('quality_metrics');
      const data = result.block!.data as { totalItems: number; qualityScore: number };
      expect(data.totalItems).toBe(20);
      expect(data.qualityScore).toBe(78);
    });

    it('returns error for missing required numbers', async () => {
      const result = await executor.execute('render_quality_metrics', {
        totalItems: 'not a number',
        qualityScore: 78,
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('requires totalItems and qualityScore');
    });
  });

  describe('render_mermaid', () => {
    it('produces a mermaid content block', async () => {
      const result = await executor.execute('render_mermaid', {
        title: 'Architecture Diagram',
        source: 'graph TD\n  A[Frontend] --> B[API]\n  B --> C[Database]',
      });

      expect(result.block).toBeDefined();
      expect(result.block!.type).toBe('mermaid');
      const data = result.block!.data as { title: string; source: string };
      expect(data.title).toBe('Architecture Diagram');
      expect(data.source).toContain('graph TD');
    });

    it('returns error for missing required fields', async () => {
      const result = await executor.execute('render_mermaid', {
        title: 'Missing source',
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('requires title and source');
    });

    it('returns error for empty source', async () => {
      const result = await executor.execute('render_mermaid', {
        title: 'Empty',
        source: '   ',
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('source cannot be empty');
    });
  });

  describe('render_chart', () => {
    const validSpec = {
      data: {
        labels: ['Q1', 'Q2', 'Q3'],
        datasets: [{ data: [10, 20, 15] }],
      },
    };

    it('produces a chart content block', async () => {
      const result = await executor.execute('render_chart', {
        title: 'Issue Distribution',
        chartType: 'bar',
        spec: validSpec,
      });

      expect(result.block).toBeDefined();
      expect(result.block!.type).toBe('chart');
      const data = result.block!.data as { title: string; chartType: string; spec: unknown };
      expect(data.title).toBe('Issue Distribution');
      expect(data.chartType).toBe('bar');
      expect(data.spec).toBeDefined();
    });

    it('accepts all valid chart types', async () => {
      for (const chartType of ['bar', 'line', 'pie', 'radar', 'doughnut']) {
        const result = await executor.execute('render_chart', {
          title: `${chartType} chart`,
          chartType,
          spec: validSpec,
        });
        expect(result.block).toBeDefined();
        expect(result.block!.type).toBe('chart');
      }
    });

    it('returns error for invalid chart type', async () => {
      const result = await executor.execute('render_chart', {
        title: 'Bad Chart',
        chartType: 'scatter',
        spec: validSpec,
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('chartType must be one of');
    });

    it('returns error for missing required fields', async () => {
      const result = await executor.execute('render_chart', {
        title: 'No spec',
        chartType: 'bar',
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('requires title, chartType, and spec');
    });

    it('returns error when spec has no data property', async () => {
      const result = await executor.execute('render_chart', {
        title: 'No data',
        chartType: 'bar',
        spec: { options: {} },
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('spec.data is required');
    });

    it('returns error when spec.data.labels is missing', async () => {
      const result = await executor.execute('render_chart', {
        title: 'No labels',
        chartType: 'bar',
        spec: { data: { datasets: [{ data: [1] }] } },
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('spec.data.labels must be an array');
    });

    it('returns error when spec.data.datasets is empty', async () => {
      const result = await executor.execute('render_chart', {
        title: 'Empty datasets',
        chartType: 'bar',
        spec: { data: { labels: ['A'], datasets: [] } },
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('spec.data.datasets must be a non-empty array');
    });

    it('returns error when spec.data.datasets is not an array', async () => {
      const result = await executor.execute('render_chart', {
        title: 'Bad datasets',
        chartType: 'pie',
        spec: { data: { labels: ['A'], datasets: 'not-array' } },
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('spec.data.datasets must be a non-empty array');
    });
  });

  describe('render_data_table', () => {
    it('produces a data_table content block', async () => {
      const result = await executor.execute('render_data_table', {
        title: 'Sprint Velocity',
        headers: ['Sprint', 'Planned', 'Completed'],
        rows: [
          ['Sprint 1', '20', '18'],
          ['Sprint 2', '22', '21'],
        ],
      });

      expect(result.block).toBeDefined();
      expect(result.block!.type).toBe('data_table');
      const data = result.block!.data as { title: string; headers: string[]; rows: string[][] };
      expect(data.title).toBe('Sprint Velocity');
      expect(data.headers).toHaveLength(3);
      expect(data.rows).toHaveLength(2);
    });

    it('returns error for missing required fields', async () => {
      const result = await executor.execute('render_data_table', {
        title: 'No rows',
        headers: ['Col1'],
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('requires title string, headers array, and rows array');
    });
  });

  describe('render_comparison', () => {
    it('produces a comparison content block via ComparisonService', async () => {
      const result = await executor.execute('render_comparison', {
        baseAnalysisId: 'a1',
        compareAnalysisId: 'a2',
      });

      expect(result.block).toBeDefined();
      expect(result.block!.type).toBe('comparison');
      const data = result.block!.data as { baseAnalysisId: string; compareAnalysisId: string; diff: unknown };
      expect(data.baseAnalysisId).toBe('a1');
      expect(data.compareAnalysisId).toBe('a2');
      expect(data.diff).toBeDefined();

      expect(comparisonService.compare).toHaveBeenCalledWith('a1', 'a2');
    });

    it('returns error when ComparisonService returns error', async () => {
      const failingService = makeMockComparisonService(); // no result → returns error
      const exec = new RenderExecutor(failingService);

      const result = await exec.execute('render_comparison', {
        baseAnalysisId: 'a1',
        compareAnalysisId: 'a2',
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('Analysis not found');
    });

    it('returns error when ComparisonService is not available', async () => {
      const exec = new RenderExecutor(); // no comparison service

      const result = await exec.execute('render_comparison', {
        baseAnalysisId: 'a1',
        compareAnalysisId: 'a2',
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('Comparison service not available');
    });

    it('returns error for missing required fields', async () => {
      const result = await executor.execute('render_comparison', {
        baseAnalysisId: 'a1',
        // missing compareAnalysisId
      });

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('requires baseAnalysisId and compareAnalysisId');
    });
  });

  describe('unknown tool', () => {
    it('returns error for unknown tool name', async () => {
      const result = await executor.execute('render_unknown', {});

      expect(result.block).toBeUndefined();
      expect(result.content).toContain('Unknown render tool: render_unknown');
    });
  });

  describe('block ID generation', () => {
    it('generates unique block IDs', async () => {
      const result1 = await executor.execute('render_mermaid', {
        title: 'A',
        source: 'graph TD; A-->B',
      });
      const result2 = await executor.execute('render_mermaid', {
        title: 'B',
        source: 'graph TD; C-->D',
      });

      expect(result1.block!.id).not.toBe(result2.block!.id);
    });
  });
});

describe('ToolExecutorRouter', () => {
  it('routes render tools to RenderExecutor', async () => {
    const { ToolExecutorRouter } = await import('./tool-executor-router');
    const compService = makeMockComparisonService(mockComparisonResult);
    const renderExecutor = new RenderExecutor(compService);
    const router = new ToolExecutorRouter(renderExecutor);

    const result = await router.execute('render_mermaid', 'render', {
      title: 'Test',
      source: 'graph TD; A-->B',
    });

    expect(result.block).toBeDefined();
    expect(result.block!.type).toBe('mermaid');
  });

  it('returns error for read tools when no ReadExecutor configured', async () => {
    const { ToolExecutorRouter } = await import('./tool-executor-router');
    const renderExecutor = new RenderExecutor();
    const router = new ToolExecutorRouter(renderExecutor);

    const result = await router.execute('fetch_jira_data', 'read', {});

    expect(result.content).toContain('not yet configured');
  });

  it('returns error for write tools when no WriteExecutor configured', async () => {
    const { ToolExecutorRouter } = await import('./tool-executor-router');
    const renderExecutor = new RenderExecutor();
    const router = new ToolExecutorRouter(renderExecutor);

    const result = await router.execute('create_jira_issue', 'write', {});

    expect(result.content).toContain('not yet configured');
  });
});

describe('createAgentHarness', () => {
  it('creates an AgentService with render and read tools registered', async () => {
    const { createAgentHarness } = await import('./agent-harness-factory');
    const mockLlmProvider = {
      name: 'mock',
      listModels: vi.fn(),
      createChatCompletion: vi.fn(),
    };
    const compService = makeMockComparisonService(mockComparisonResult);

    const agentService = createAgentHarness({
      llmProvider: mockLlmProvider,
      comparisonService: compService,
      integrationRepo: { findByWorkspaceAndProvider: vi.fn() } as any,
      integrationCacheRepo: { findByType: vi.fn(), findEntry: vi.fn() } as any,
      profileRepo: { findByWorkspace: vi.fn() } as any,
      workspaceService: { getCurrentId: vi.fn() } as any,
    });

    expect(agentService).toBeDefined();
    expect(agentService.isRunning).toBe(false);
  });
});
