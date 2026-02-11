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
      epics: [{ key: 'PROJ-1', summary: 'Epic 1' }],
      stories: [{ key: 'PROJ-10', summary: 'Story 1' }],
    },
    confluenceData: null,
    githubData: null,
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
});
