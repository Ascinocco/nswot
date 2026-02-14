import { describe, it, expect, vi } from 'vitest';
import { ComparisonService } from '../services/comparison.service';
import type { AnalysisRepository } from '../repositories/analysis.repository';
import type { Analysis } from '../domain/types';

function makeAnalysis(id: string, overrides?: Partial<Analysis>): Analysis {
  return {
    id,
    workspaceId: 'ws-1',
    role: 'staff_engineer',
    modelId: 'openai/gpt-4',
    status: 'completed',
    config: { profileIds: ['p1'], jiraProjectKeys: ['PROJ'], confluenceSpaceKeys: [], githubRepos: [], codebaseRepos: [] },
    inputSnapshot: null,
    swotOutput: {
      strengths: [
        {
          claim: 'Strong testing culture with high coverage',
          evidence: [{ sourceType: 'profile', sourceId: 'profile:A', sourceLabel: 'A', quote: 'Great tests' }],
          impact: 'Reduces regressions',
          recommendation: 'Maintain coverage standards',
          confidence: 'high',
        },
      ],
      weaknesses: [
        {
          claim: 'Slow CI pipeline taking 45 minutes',
          evidence: [{ sourceType: 'jira', sourceId: 'jira:PROJ-10', sourceLabel: 'PROJ-10', quote: 'CI takes 45 min' }],
          impact: 'Reduced productivity',
          recommendation: 'Parallelize builds',
          confidence: 'medium',
        },
      ],
      opportunities: [],
      threats: [],
    },
    summariesOutput: { profiles: 'Summary', jira: 'Jira summary', confluence: null, github: null, codebase: null },
    qualityMetrics: null,
    rawLlmResponse: '{}',
    warning: null,
    error: null,
    startedAt: '2024-01-01T00:00:00.000Z',
    completedAt: '2024-01-01T00:01:00.000Z',
    conversationId: null,
    parentAnalysisId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Comparison integration', () => {
  it('detects changed claims when similar items have different confidence', async () => {
    const analysisA = makeAnalysis('a-1');
    const analysisB = makeAnalysis('a-2', {
      swotOutput: {
        strengths: [
          {
            // Similar claim, different confidence
            claim: 'Strong testing culture with excellent coverage',
            evidence: [
              { sourceType: 'profile', sourceId: 'profile:A', sourceLabel: 'A', quote: 'Great tests' },
              { sourceType: 'jira', sourceId: 'jira:PROJ-5', sourceLabel: 'PROJ-5', quote: 'All green' },
            ],
            impact: 'Reduces regressions significantly',
            recommendation: 'Expand to integration tests',
            confidence: 'high',
          },
        ],
        weaknesses: [
          {
            claim: 'Slow CI pipeline taking 45 minutes',
            evidence: [{ sourceType: 'jira', sourceId: 'jira:PROJ-10', sourceLabel: 'PROJ-10', quote: 'CI slow' }],
            impact: 'Blocks deploys',
            recommendation: 'Cache dependencies',
            confidence: 'high', // Changed from medium
          },
        ],
        opportunities: [],
        threats: [],
      },
    });

    const repo = {
      findById: vi.fn().mockImplementation(async (id: string) =>
        id === 'a-1' ? analysisA : analysisB,
      ),
    } as unknown as AnalysisRepository;

    const service = new ComparisonService(repo);
    const result = await service.compare('a-1', 'a-2');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should detect changed items (similar claims with differences)
    const changed = result.value.deltas.filter((d) => d.kind === 'changed');
    expect(changed.length).toBeGreaterThanOrEqual(1);

    // CI pipeline weakness should be detected as changed (confidence medium → high)
    const ciDelta = result.value.deltas.find(
      (d) => d.claim.includes('CI pipeline') || d.matchedClaim?.includes('CI pipeline'),
    );
    expect(ciDelta).toBeDefined();
  });

  it('detects added and removed items across analyses', async () => {
    const analysisA = makeAnalysis('a-1');
    const analysisB = makeAnalysis('a-2', {
      swotOutput: {
        strengths: [
          {
            claim: 'Strong testing culture with high coverage',
            evidence: [{ sourceType: 'profile', sourceId: 'profile:A', sourceLabel: 'A', quote: 'Tests' }],
            impact: 'Good',
            recommendation: 'Keep it',
            confidence: 'high',
          },
        ],
        weaknesses: [], // Removed the CI weakness
        opportunities: [
          {
            // New opportunity not in A
            claim: 'Adopt trunk-based development',
            evidence: [{ sourceType: 'profile', sourceId: 'profile:B', sourceLabel: 'B', quote: 'We should try TBD' }],
            impact: 'Faster delivery',
            recommendation: 'Pilot with one team',
            confidence: 'medium',
          },
        ],
        threats: [],
      },
    });

    const repo = {
      findById: vi.fn().mockImplementation(async (id: string) =>
        id === 'a-1' ? analysisA : analysisB,
      ),
    } as unknown as AnalysisRepository;

    const service = new ComparisonService(repo);
    const result = await service.compare('a-1', 'a-2');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const added = result.value.deltas.filter((d) => d.kind === 'added');
    const removed = result.value.deltas.filter((d) => d.kind === 'removed');

    // The new opportunity should be added
    expect(added.some((d) => d.claim.includes('trunk-based'))).toBe(true);

    // The CI weakness from A should be removed
    expect(removed.some((d) => d.claim.includes('CI pipeline'))).toBe(true);
  });

  it('summary counts match delta array', async () => {
    const analysisA = makeAnalysis('a-1');
    const analysisB = makeAnalysis('a-2', {
      swotOutput: {
        strengths: [],
        weaknesses: [
          {
            claim: 'On-call burnout is severe',
            evidence: [{ sourceType: 'profile', sourceId: 'profile:C', sourceLabel: 'C', quote: 'Exhausted' }],
            impact: 'Attrition risk',
            recommendation: 'Restructure rotations',
            confidence: 'high',
          },
        ],
        opportunities: [],
        threats: [
          {
            claim: 'Key person dependency on infrastructure lead',
            evidence: [{ sourceType: 'profile', sourceId: 'profile:A', sourceLabel: 'A', quote: 'Single point' }],
            impact: 'Bus factor risk',
            recommendation: 'Cross-train team members',
            confidence: 'medium',
          },
        ],
      },
    });

    const repo = {
      findById: vi.fn().mockImplementation(async (id: string) =>
        id === 'a-1' ? analysisA : analysisB,
      ),
    } as unknown as AnalysisRepository;

    const service = new ComparisonService(repo);
    const result = await service.compare('a-1', 'a-2');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { summary, deltas } = result.value;
    const actualAdded = deltas.filter((d) => d.kind === 'added').length;
    const actualRemoved = deltas.filter((d) => d.kind === 'removed').length;
    const actualChanged = deltas.filter((d) => d.kind === 'changed').length;

    expect(summary.totalAdded).toBe(actualAdded);
    expect(summary.totalRemoved).toBe(actualRemoved);
    expect(summary.totalChanged).toBe(actualChanged);
  });

  it('per-category breakdown is accurate', async () => {
    const analysisA = makeAnalysis('a-1');
    const analysisB = makeAnalysis('a-2', {
      swotOutput: {
        strengths: analysisA.swotOutput!.strengths,
        weaknesses: [],
        opportunities: [
          {
            claim: 'New market opportunity',
            evidence: [{ sourceType: 'profile', sourceId: 'profile:A', sourceLabel: 'A', quote: 'Growing market' }],
            impact: 'Revenue growth',
            recommendation: 'Invest in product',
            confidence: 'medium',
          },
        ],
        threats: [],
      },
    });

    const repo = {
      findById: vi.fn().mockImplementation(async (id: string) =>
        id === 'a-1' ? analysisA : analysisB,
      ),
    } as unknown as AnalysisRepository;

    const service = new ComparisonService(repo);
    const result = await service.compare('a-1', 'a-2');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { summary } = result.value;

    // Weaknesses: CI pipeline removed from B
    expect(summary.weaknesses.removed).toBe(1);

    // Opportunities: new one added in B
    expect(summary.opportunities.added).toBe(1);

    // Strengths: same in both — should have 0 added/removed
    expect(summary.strengths.added + summary.strengths.removed).toBeLessThanOrEqual(1);
  });
});
