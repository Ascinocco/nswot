import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComparisonService, claimSimilarity } from './comparison.service';
import type { AnalysisRepository } from '../repositories/analysis.repository';
import type { Analysis, SwotOutput, SwotItem } from '../domain/types';

function makeSwotItem(overrides: Partial<SwotItem> = {}): SwotItem {
  return {
    claim: 'Test claim',
    evidence: [
      {
        sourceType: 'profile',
        sourceId: 'p1',
        sourceLabel: 'Stakeholder A',
        quote: 'some quote',
      },
    ],
    impact: 'Some impact',
    recommendation: 'Some recommendation',
    confidence: 'high',
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    id: 'a1',
    workspaceId: 'w1',
    role: 'staff_engineer',
    modelId: 'test-model',
    status: 'completed',
    config: {
      profileIds: [],
      jiraProjectKeys: [],
      confluenceSpaceKeys: [],
      githubRepos: [],
      codebaseRepos: [],
    },
    inputSnapshot: null,
    swotOutput: {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
    },
    summariesOutput: null,
    qualityMetrics: null,
    rawLlmResponse: null,
    warning: null,
    error: null,
    startedAt: null,
    completedAt: '2024-01-01T00:00:00.000Z',
    conversationId: null,
    parentAnalysisId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('claimSimilarity', () => {
  it('returns 1 for identical claims', () => {
    expect(claimSimilarity('Strong team culture', 'Strong team culture')).toBe(1);
  });

  it('returns 1 for identical claims ignoring case', () => {
    expect(claimSimilarity('Strong Team Culture', 'strong team culture')).toBe(1);
  });

  it('returns high score for similar claims', () => {
    const score = claimSimilarity(
      'Strong engineering team culture',
      'Strong engineering culture within the team',
    );
    expect(score).toBeGreaterThan(0.4);
  });

  it('returns low score for unrelated claims', () => {
    const score = claimSimilarity(
      'Strong engineering team culture',
      'Budget constraints limiting new hires',
    );
    expect(score).toBeLessThan(0.4);
  });

  it('handles substring containment', () => {
    const score = claimSimilarity('Strong team', 'Strong team culture');
    expect(score).toBeGreaterThan(0.5);
  });

  it('returns 0 for empty strings', () => {
    expect(claimSimilarity('', 'test')).toBe(0);
    expect(claimSimilarity('test', '')).toBe(0);
  });
});

describe('ComparisonService', () => {
  let service: ComparisonService;
  let mockRepo: {
    findById: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRepo = {
      findById: vi.fn(),
    };
    service = new ComparisonService(mockRepo as unknown as AnalysisRepository);
  });

  it('returns error when analysis A not found', async () => {
    mockRepo.findById.mockResolvedValueOnce(null);
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'b1' }));

    const result = await service.compare('missing', 'b1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('missing');
    }
  });

  it('returns error when analysis B not found', async () => {
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'a1' }));
    mockRepo.findById.mockResolvedValueOnce(null);

    const result = await service.compare('a1', 'missing');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('missing');
    }
  });

  it('returns error when analysis A is not completed', async () => {
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'a1', status: 'running', swotOutput: null }));
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'b1' }));

    const result = await service.compare('a1', 'b1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('not completed');
    }
  });

  it('produces unchanged deltas for identical analyses', async () => {
    const swot: SwotOutput = {
      strengths: [makeSwotItem({ claim: 'Good testing practices' })],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'a1', swotOutput: swot }));
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'b1', swotOutput: swot }));

    const result = await service.compare('a1', 'b1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.deltas).toHaveLength(1);
      expect(result.value.deltas[0]!.kind).toBe('unchanged');
      expect(result.value.summary.totalAdded).toBe(0);
      expect(result.value.summary.totalRemoved).toBe(0);
      expect(result.value.summary.totalChanged).toBe(0);
      expect(result.value.summary.totalUnchanged).toBe(1);
    }
  });

  it('detects added items', async () => {
    const swotA: SwotOutput = {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };
    const swotB: SwotOutput = {
      strengths: [makeSwotItem({ claim: 'New strength discovered' })],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'a1', swotOutput: swotA }));
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'b1', swotOutput: swotB }));

    const result = await service.compare('a1', 'b1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.deltas).toHaveLength(1);
      expect(result.value.deltas[0]!.kind).toBe('added');
      expect(result.value.deltas[0]!.category).toBe('strengths');
      expect(result.value.deltas[0]!.claim).toBe('New strength discovered');
      expect(result.value.summary.totalAdded).toBe(1);
    }
  });

  it('detects removed items', async () => {
    const swotA: SwotOutput = {
      strengths: [makeSwotItem({ claim: 'Old strength no longer relevant' })],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };
    const swotB: SwotOutput = {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'a1', swotOutput: swotA }));
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'b1', swotOutput: swotB }));

    const result = await service.compare('a1', 'b1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.deltas).toHaveLength(1);
      expect(result.value.deltas[0]!.kind).toBe('removed');
      expect(result.value.deltas[0]!.claim).toBe('Old strength no longer relevant');
      expect(result.value.summary.totalRemoved).toBe(1);
    }
  });

  it('detects changed items with confidence delta', async () => {
    const swotA: SwotOutput = {
      strengths: [makeSwotItem({ claim: 'Strong testing practices', confidence: 'medium' })],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };
    const swotB: SwotOutput = {
      strengths: [makeSwotItem({ claim: 'Strong testing practices', confidence: 'high' })],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'a1', swotOutput: swotA }));
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'b1', swotOutput: swotB }));

    const result = await service.compare('a1', 'b1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.deltas).toHaveLength(1);
      const delta = result.value.deltas[0]!;
      expect(delta.kind).toBe('changed');
      expect(delta.confidenceDelta).toEqual({ before: 'medium', after: 'high' });
      expect(result.value.summary.totalChanged).toBe(1);
    }
  });

  it('detects changed items with source delta', async () => {
    const itemA = makeSwotItem({
      claim: 'Strong team culture',
      evidence: [
        { sourceType: 'profile', sourceId: 'p1', sourceLabel: 'A', quote: 'q1' },
      ],
    });
    const itemB = makeSwotItem({
      claim: 'Strong team culture',
      evidence: [
        { sourceType: 'profile', sourceId: 'p1', sourceLabel: 'A', quote: 'q1' },
        { sourceType: 'jira', sourceId: 'j1', sourceLabel: 'PROJ-1', quote: 'q2' },
      ],
    });

    const swotA: SwotOutput = { strengths: [itemA], weaknesses: [], opportunities: [], threats: [] };
    const swotB: SwotOutput = { strengths: [itemB], weaknesses: [], opportunities: [], threats: [] };

    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'a1', swotOutput: swotA }));
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'b1', swotOutput: swotB }));

    const result = await service.compare('a1', 'b1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const delta = result.value.deltas[0]!;
      expect(delta.kind).toBe('changed');
      expect(delta.sourceDelta).toEqual({ added: ['jira'], removed: [] });
      expect(delta.evidenceCountDelta).toEqual({ before: 1, after: 2 });
    }
  });

  it('matches similar but not identical claims', async () => {
    const swotA: SwotOutput = {
      strengths: [makeSwotItem({ claim: 'Strong engineering team culture and practices' })],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };
    const swotB: SwotOutput = {
      strengths: [
        makeSwotItem({
          claim: 'Strong engineering culture and team practices',
          confidence: 'low',
        }),
      ],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };

    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'a1', swotOutput: swotA }));
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'b1', swotOutput: swotB }));

    const result = await service.compare('a1', 'b1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should match as changed (similar claims), not as removed + added
      expect(result.value.deltas).toHaveLength(1);
      expect(result.value.deltas[0]!.kind).toBe('changed');
      expect(result.value.deltas[0]!.matchedClaim).toBeDefined();
      expect(result.value.deltas[0]!.similarity).toBeGreaterThan(0.4);
    }
  });

  it('handles multi-category changes', async () => {
    const swotA: SwotOutput = {
      strengths: [makeSwotItem({ claim: 'Good CI/CD pipeline' })],
      weaknesses: [makeSwotItem({ claim: 'Poor documentation' })],
      opportunities: [],
      threats: [makeSwotItem({ claim: 'Key person risk' })],
    };
    const swotB: SwotOutput = {
      strengths: [makeSwotItem({ claim: 'Good CI/CD pipeline' })],
      weaknesses: [],
      opportunities: [makeSwotItem({ claim: 'Expand to new markets' })],
      threats: [makeSwotItem({ claim: 'Key person risk' })],
    };

    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'a1', swotOutput: swotA }));
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'b1', swotOutput: swotB }));

    const result = await service.compare('a1', 'b1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary.strengths.unchanged).toBe(1);
      expect(result.value.summary.weaknesses.removed).toBe(1);
      expect(result.value.summary.opportunities.added).toBe(1);
      expect(result.value.summary.threats.unchanged).toBe(1);
      expect(result.value.summary.totalAdded).toBe(1);
      expect(result.value.summary.totalRemoved).toBe(1);
      expect(result.value.summary.totalUnchanged).toBe(2);
    }
  });

  it('returns correct analysisId pair and timestamp', async () => {
    const swot: SwotOutput = { strengths: [], weaknesses: [], opportunities: [], threats: [] };
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'a1', swotOutput: swot }));
    mockRepo.findById.mockResolvedValueOnce(makeAnalysis({ id: 'b1', swotOutput: swot }));

    const result = await service.compare('a1', 'b1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.analysisIdA).toBe('a1');
      expect(result.value.analysisIdB).toBe('b1');
      expect(result.value.createdAt).toBeTruthy();
    }
  });
});
