import { describe, it, expect } from 'vitest';
import { parseAnalysisResponse } from './response-parser';

const VALID_OUTPUT = {
  strengths: [
    {
      claim: 'Strong technical leadership',
      evidence: [
        {
          sourceType: 'profile',
          sourceId: 'profile:Stakeholder A',
          sourceLabel: 'Stakeholder A',
          quote: 'The team has great technical depth',
        },
      ],
      impact: 'Enables complex technical initiatives',
      recommendation: 'Leverage for architecture reviews',
      confidence: 'high',
    },
  ],
  weaknesses: [
    {
      claim: 'Slow CI pipeline',
      evidence: [
        {
          sourceType: 'profile',
          sourceId: 'profile:Stakeholder B',
          sourceLabel: 'Stakeholder B',
          quote: 'CI takes 47 minutes',
        },
      ],
      impact: 'Reduced developer productivity',
      recommendation: 'Invest in parallelization',
      confidence: 'medium',
    },
  ],
  opportunities: [],
  threats: [],
  summaries: {
    profiles: 'Key themes include technical leadership and CI concerns.',
    jira: 'No Jira data available.',
  },
};

describe('parseAnalysisResponse', () => {
  it('parses valid JSON in code fence', () => {
    const raw = '```json\n' + JSON.stringify(VALID_OUTPUT) + '\n```';
    const result = parseAnalysisResponse(raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.swotOutput.strengths).toHaveLength(1);
      expect(result.value.swotOutput.strengths[0]!.claim).toBe('Strong technical leadership');
      expect(result.value.swotOutput.weaknesses).toHaveLength(1);
      expect(result.value.summariesOutput.profiles).toContain('technical leadership');
    }
  });

  it('parses raw JSON without code fence', () => {
    const raw = JSON.stringify(VALID_OUTPUT);
    const result = parseAnalysisResponse(raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.swotOutput.strengths).toHaveLength(1);
    }
  });

  it('parses JSON with surrounding text', () => {
    const raw = 'Here is the analysis:\n' + JSON.stringify(VALID_OUTPUT) + '\nDone.';
    const result = parseAnalysisResponse(raw);

    expect(result.ok).toBe(true);
  });

  it('fails on completely invalid content', () => {
    const result = parseAnalysisResponse('This is not JSON at all');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_PARSE_ERROR');
    }
  });

  it('fails on malformed JSON', () => {
    const result = parseAnalysisResponse('```json\n{invalid json}\n```');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_PARSE_ERROR');
    }
  });

  it('fails when strengths array is missing', () => {
    const output = { ...VALID_OUTPUT, strengths: undefined };
    const result = parseAnalysisResponse(JSON.stringify(output));
    expect(result.ok).toBe(false);
  });

  it('fails when a SWOT item has no evidence', () => {
    const output = {
      ...VALID_OUTPUT,
      strengths: [
        {
          claim: 'Unsupported claim',
          evidence: [],
          impact: 'Something',
          recommendation: 'Something',
          confidence: 'low',
        },
      ],
    };
    const result = parseAnalysisResponse(JSON.stringify(output));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_EVIDENCE_INVALID');
    }
  });

  it('fails when confidence is invalid', () => {
    const output = {
      ...VALID_OUTPUT,
      strengths: [
        {
          ...VALID_OUTPUT.strengths[0],
          confidence: 'very-high',
        },
      ],
    };
    const result = parseAnalysisResponse(JSON.stringify(output));
    expect(result.ok).toBe(false);
  });

  it('fails when summaries is missing', () => {
    const { summaries: _, ...noSummaries } = VALID_OUTPUT;
    const result = parseAnalysisResponse(JSON.stringify(noSummaries));
    expect(result.ok).toBe(false);
  });

  it('fails when evidence sourceType is invalid', () => {
    const output = {
      ...VALID_OUTPUT,
      strengths: [
        {
          ...VALID_OUTPUT.strengths[0],
          evidence: [
            {
              sourceType: 'confluence',
              sourceId: 'conf:123',
              sourceLabel: 'Page',
              quote: 'content',
            },
          ],
        },
      ],
    };
    const result = parseAnalysisResponse(JSON.stringify(output));
    expect(result.ok).toBe(false);
  });

  it('handles empty quadrant arrays', () => {
    const output = {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
      summaries: { profiles: 'Nothing found.', jira: 'No data.' },
    };
    const result = parseAnalysisResponse(JSON.stringify(output));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.swotOutput.strengths).toEqual([]);
    }
  });
});
