import { describe, it, expect, vi } from 'vitest';
import { ExportService } from './export.service';
import type { AnalysisRepository } from '../repositories/analysis.repository';
import type { Analysis, AnalysisProfile } from '../domain/types';

function makeRichAnalysis(): Analysis {
  return {
    id: 'analysis-export',
    workspaceId: 'ws-1',
    role: 'staff_engineer',
    modelId: 'openai/gpt-4',
    status: 'completed',
    config: { profileIds: ['p1', 'p2'], jiraProjectKeys: ['PROJ'], confluenceSpaceKeys: [], githubRepos: [], codebaseRepos: ['org/repo'] },
    inputSnapshot: null,
    swotOutput: {
      strengths: [
        {
          claim: 'Strong testing culture with 92% coverage',
          evidence: [
            { sourceType: 'profile', sourceId: 'profile:Stakeholder A', sourceLabel: 'Stakeholder A', quote: 'Our test coverage is industry-leading' },
            { sourceType: 'codebase', sourceId: 'codebase:org/repo', sourceLabel: 'org/repo', quote: '92% line coverage' },
          ],
          impact: 'Reduces regression risk',
          recommendation: 'Maintain coverage standards',
          confidence: 'high',
        },
        {
          claim: 'Experienced technical leadership',
          evidence: [
            { sourceType: 'profile', sourceId: 'profile:Stakeholder B', sourceLabel: 'Stakeholder B', quote: 'Deep domain expertise across the team' },
          ],
          impact: 'Enables complex architecture decisions',
          recommendation: 'Leverage for design reviews',
          confidence: 'medium',
        },
      ],
      weaknesses: [
        {
          claim: 'CI pipeline takes 45 minutes',
          evidence: [
            { sourceType: 'jira', sourceId: 'jira:PROJ-10', sourceLabel: 'PROJ-10', quote: 'CI consistently takes 45+ minutes' },
          ],
          impact: 'Developer productivity loss',
          recommendation: 'Parallelize test suites and cache dependencies',
          confidence: 'high',
        },
      ],
      opportunities: [
        {
          claim: 'Adopt trunk-based development',
          evidence: [
            { sourceType: 'profile', sourceId: 'profile:Stakeholder A', sourceLabel: 'Stakeholder A', quote: 'Long-lived branches cause merge pain' },
          ],
          impact: 'Faster integration and shorter feedback loops',
          recommendation: 'Pilot with one team for a quarter',
          confidence: 'medium',
        },
      ],
      threats: [
        {
          claim: 'Key person dependency on infrastructure lead',
          evidence: [
            { sourceType: 'profile', sourceId: 'profile:Stakeholder B', sourceLabel: 'Stakeholder B', quote: 'Only one person knows the deploy system' },
          ],
          impact: 'Bus factor risk for critical systems',
          recommendation: 'Cross-train at least two more engineers',
          confidence: 'high',
        },
      ],
    },
    summariesOutput: {
      profiles: 'Stakeholders report strong testing but CI slowness.',
      jira: 'Active sprint with infrastructure improvements.',
      confluence: null,
      github: null,
      codebase: 'Well-structured codebase with high coverage.',
    },
    qualityMetrics: {
      totalItems: 5,
      multiSourceItems: 1,
      sourceTypeCoverage: { profile: 5, jira: 1, codebase: 1 },
      confidenceDistribution: { high: 3, medium: 2, low: 0 },
      averageEvidencePerItem: 1.4,
      qualityScore: 65,
    },
    rawLlmResponse: '{}',
    warning: null,
    error: null,
    startedAt: '2024-01-01T00:00:00.000Z',
    completedAt: '2024-01-01T00:01:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

const mockProfiles: AnalysisProfile[] = [
  { analysisId: 'analysis-export', profileId: 'p1', anonymizedLabel: 'Stakeholder A' },
  { analysisId: 'analysis-export', profileId: 'p2', anonymizedLabel: 'Stakeholder B' },
];

function makeRepo(): AnalysisRepository {
  return {
    findById: vi.fn().mockResolvedValue(makeRichAnalysis()),
    findProfiles: vi.fn().mockResolvedValue(mockProfiles),
  } as unknown as AnalysisRepository;
}

describe('Multi-format export integration', () => {
  it('exports markdown with SWOT quadrant headers and evidence', async () => {
    const service = new ExportService(makeRepo());
    const result = await service.exportMarkdown('analysis-export');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const md = result.value;
    expect(md).toContain('Strengths');
    expect(md).toContain('Weaknesses');
    expect(md).toContain('Opportunities');
    expect(md).toContain('Threats');
    expect(md).toContain('Strong testing culture');
    expect(md).toContain('CI pipeline');
    expect(md).toContain('industry-leading');
  });

  it('exports CSV with header row and correct data row count', async () => {
    const service = new ExportService(makeRepo());
    const result = await service.exportCSV('analysis-export');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const csv = result.value;
    const lines = csv.split('\n').filter((l) => l.trim().length > 0);

    // Header + 5 SWOT items (2 strengths + 1 weakness + 1 opportunity + 1 threat)
    expect(lines.length).toBe(6);

    // Header should contain column names
    const header = lines[0]!;
    expect(header).toContain('quadrant');
    expect(header).toContain('claim');
    expect(header).toContain('confidence');
  });

  it('exports PDF as non-empty Buffer', async () => {
    const service = new ExportService(makeRepo());
    const result = await service.exportPDF('analysis-export');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const buffer = result.value;
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // PDF files start with %PDF-
    expect(buffer.toString('ascii', 0, 5)).toBe('%PDF-');
  });

  it('all 3 formats succeed on the same analysis without error', async () => {
    const repo = makeRepo();
    const service = new ExportService(repo);

    const [md, csv, pdf] = await Promise.all([
      service.exportMarkdown('analysis-export'),
      service.exportCSV('analysis-export'),
      service.exportPDF('analysis-export'),
    ]);

    expect(md.ok).toBe(true);
    expect(csv.ok).toBe(true);
    expect(pdf.ok).toBe(true);
  });
});
