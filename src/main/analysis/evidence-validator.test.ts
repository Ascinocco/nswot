import { describe, it, expect } from 'vitest';
import { validateEvidence } from './evidence-validator';
import type { SwotOutput, AnonymizedPayload } from '../domain/types';

function makeSnapshot(profileLabels: string[]): AnonymizedPayload {
  return {
    profiles: profileLabels.map((label) => ({
      label,
      role: null,
      team: null,
      concerns: null,
      priorities: null,
      quotes: [],
      notes: null,
    })),
    jiraData: {
      markdown: '### Epics\n- [PROJ-1] Epic 1 (Status: Open)\n### Stories\n- [PROJ-10] Story 1 (Status: Open)\n',
    },
    confluenceData: null,
    githubData: null,
    codebaseData: null,
    pseudonymMap: {},
  };
}

describe('validateEvidence', () => {
  it('passes when all sourceIds are valid', () => {
    const swotOutput: SwotOutput = {
      strengths: [
        {
          claim: 'Good leadership',
          evidence: [
            {
              sourceType: 'profile',
              sourceId: 'profile:Stakeholder A',
              sourceLabel: 'Stakeholder A',
              quote: 'Great team',
            },
          ],
          impact: 'High morale',
          recommendation: 'Continue',
          confidence: 'high',
        },
      ],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };

    const snapshot = makeSnapshot(['Stakeholder A', 'Stakeholder B']);
    const result = validateEvidence(swotOutput, snapshot);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.warnings).toEqual([]);
    }
  });

  it('warns on invalid profile sourceId', () => {
    const swotOutput: SwotOutput = {
      strengths: [
        {
          claim: 'Something',
          evidence: [
            {
              sourceType: 'profile',
              sourceId: 'profile:Stakeholder Z',
              sourceLabel: 'Stakeholder Z',
              quote: 'Unknown',
            },
          ],
          impact: 'Something',
          recommendation: 'Something',
          confidence: 'low',
        },
      ],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };

    const snapshot = makeSnapshot(['Stakeholder A']);
    const result = validateEvidence(swotOutput, snapshot);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.warnings).toHaveLength(1);
      expect(result.value.warnings[0]).toContain('Stakeholder Z');
    }
  });

  it('validates Jira sourceIds from snapshot', () => {
    const swotOutput: SwotOutput = {
      strengths: [
        {
          claim: 'Active development',
          evidence: [
            {
              sourceType: 'jira',
              sourceId: 'jira:PROJ-1',
              sourceLabel: 'PROJ-1',
              quote: 'Epic in progress',
            },
          ],
          impact: 'Good velocity',
          recommendation: 'Keep going',
          confidence: 'medium',
        },
      ],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };

    const snapshot = makeSnapshot(['Stakeholder A']);
    const result = validateEvidence(swotOutput, snapshot);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
    }
  });

  it('fails when a SWOT item has no evidence', () => {
    const swotOutput: SwotOutput = {
      strengths: [
        {
          claim: 'Unsupported',
          evidence: [],
          impact: 'Unknown',
          recommendation: 'Unknown',
          confidence: 'low',
        },
      ],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };

    const snapshot = makeSnapshot(['Stakeholder A']);
    const result = validateEvidence(swotOutput, snapshot);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_EVIDENCE_INVALID');
    }
  });

  it('checks all quadrants', () => {
    const swotOutput: SwotOutput = {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [
        {
          claim: 'Risk',
          evidence: [
            {
              sourceType: 'profile',
              sourceId: 'profile:Nonexistent',
              sourceLabel: 'Ghost',
              quote: 'Boo',
            },
          ],
          impact: 'Bad',
          recommendation: 'Fix',
          confidence: 'low',
        },
      ],
    };

    const snapshot = makeSnapshot(['Stakeholder A']);
    const result = validateEvidence(swotOutput, snapshot);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.warnings[0]).toContain('threats[0]');
    }
  });

  it('validates GitHub sourceIds from markdown snapshot', () => {
    const snapshot: AnonymizedPayload = {
      profiles: [{ label: 'Stakeholder A', role: null, team: null, concerns: null, priorities: null, quotes: [], notes: null }],
      jiraData: null,
      confluenceData: null,
      githubData: {
        markdown: '### Pull Requests\n- [owner/repo#2] Fix auth bug (State: merged, +10/-5, 3 files)\n- [owner/repo#14] Add tests (State: open, +50/-0, 2 files)\n### Issues\n- [owner/repo#8] Performance issue (State: open, Created: 2024-01-01)\n',
      },
      codebaseData: null,
      pseudonymMap: {},
    };

    const swotOutput: SwotOutput = {
      strengths: [{
        claim: 'Active PR workflow',
        evidence: [
          { sourceType: 'github', sourceId: 'github:owner/repo#2', sourceLabel: 'PR #2', quote: 'Fix auth bug' },
          { sourceType: 'github', sourceId: 'github:owner/repo#14', sourceLabel: 'PR #14', quote: 'Add tests' },
        ],
        impact: 'Good velocity',
        recommendation: 'Continue',
        confidence: 'high',
      }],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };

    const result = validateEvidence(swotOutput, snapshot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.warnings).toEqual([]);
    }
  });

  it('validates codebase sourceIds from markdown snapshot', () => {
    const snapshot: AnonymizedPayload = {
      profiles: [{ label: 'Stakeholder A', role: null, team: null, concerns: null, priorities: null, quotes: [], notes: null }],
      jiraData: null,
      confluenceData: null,
      githubData: null,
      codebaseData: {
        markdown: '### [owner/repo]\n**Architecture**: Clean architecture\n\n### [org/lib]\n**Architecture**: Modular\n',
      },
      pseudonymMap: {},
    };

    const swotOutput: SwotOutput = {
      strengths: [{
        claim: 'Clean architecture',
        evidence: [
          { sourceType: 'codebase', sourceId: 'codebase:owner/repo', sourceLabel: 'owner/repo', quote: 'Clean architecture' },
          { sourceType: 'codebase', sourceId: 'codebase:org/lib', sourceLabel: 'org/lib', quote: 'Modular' },
        ],
        impact: 'Easy to maintain',
        recommendation: 'Continue',
        confidence: 'high',
      }],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };

    const result = validateEvidence(swotOutput, snapshot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.warnings).toEqual([]);
    }
  });

  it('warns when codebase sourceId repo is missing from markdown', () => {
    const snapshot: AnonymizedPayload = {
      profiles: [{ label: 'Stakeholder A', role: null, team: null, concerns: null, priorities: null, quotes: [], notes: null }],
      jiraData: null,
      confluenceData: null,
      githubData: null,
      codebaseData: {
        markdown: '### [owner/repo]\n**Architecture**: Clean\n',
      },
      pseudonymMap: {},
    };

    const swotOutput: SwotOutput = {
      strengths: [{
        claim: 'Technical debt',
        evidence: [
          { sourceType: 'codebase', sourceId: 'codebase:other/missing', sourceLabel: 'other/missing', quote: 'Debt' },
        ],
        impact: 'Bad',
        recommendation: 'Fix',
        confidence: 'low',
      }],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };

    const result = validateEvidence(swotOutput, snapshot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.warnings).toHaveLength(1);
      expect(result.value.warnings[0]).toContain('codebase:other/missing');
    }
  });

  it('warns when GitHub sourceId repo is missing from markdown', () => {
    const snapshot: AnonymizedPayload = {
      profiles: [{ label: 'Stakeholder A', role: null, team: null, concerns: null, priorities: null, quotes: [], notes: null }],
      jiraData: null,
      confluenceData: null,
      githubData: {
        markdown: '### Pull Requests\n- [#2] Fix auth bug (State: merged, +10/-5, 3 files)\n### Issues\n',
      },
      codebaseData: null,
      pseudonymMap: {},
    };

    const swotOutput: SwotOutput = {
      strengths: [{
        claim: 'Active PR workflow',
        evidence: [
          { sourceType: 'github', sourceId: 'github:owner/repo#2', sourceLabel: 'PR #2', quote: 'Fix auth bug' },
        ],
        impact: 'Good velocity',
        recommendation: 'Continue',
        confidence: 'high',
      }],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };

    const result = validateEvidence(swotOutput, snapshot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.warnings).toHaveLength(1);
      expect(result.value.warnings[0]).toContain('github:owner/repo#2');
    }
  });
});
