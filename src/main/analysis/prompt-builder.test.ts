import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildCorrectivePrompt,
  PROMPT_VERSION,
} from './prompt-builder';
import { calculateTokenBudget } from './token-budget';
import type { AnonymizedProfile } from '../domain/types';

describe('prompt-builder', () => {
  const budget = calculateTokenBudget(100_000);

  const profiles: AnonymizedProfile[] = [
    {
      label: 'Stakeholder A',
      role: 'Staff Engineer',
      team: 'Platform',
      concerns: 'Scaling issues',
      priorities: 'Reliability',
      quotes: ['We need better monitoring', 'Scaling is the top priority'],
      notes: 'Key stakeholder',
    },
    {
      label: 'Stakeholder B',
      role: null,
      team: null,
      concerns: null,
      priorities: 'Migration',
      quotes: [],
      notes: null,
    },
  ];

  describe('buildSystemPrompt', () => {
    it('includes evidence-grounding rules', () => {
      const prompt = buildSystemPrompt();
      expect(prompt).toContain('NEVER invent information');
      expect(prompt).toContain('cite specific evidence');
      expect(prompt).toContain('JSON');
    });
  });

  describe('buildUserPrompt', () => {
    it('includes role context for staff engineer', () => {
      const prompt = buildUserPrompt('staff_engineer', profiles, null, budget);
      expect(prompt).toContain('Staff Engineer');
      expect(prompt).toContain('tactical');
    });

    it('includes role context for senior EM', () => {
      const prompt = buildUserPrompt('senior_em', profiles, null, budget);
      expect(prompt).toContain('Senior Engineering Manager');
      expect(prompt).toContain('process');
    });

    it('includes anonymized profile data', () => {
      const prompt = buildUserPrompt('staff_engineer', profiles, null, budget);
      expect(prompt).toContain('Stakeholder A');
      expect(prompt).toContain('Staff Engineer');
      expect(prompt).toContain('We need better monitoring');
      expect(prompt).toContain('Stakeholder B');
    });

    it('handles null profile fields gracefully', () => {
      const prompt = buildUserPrompt('staff_engineer', profiles, null, budget);
      expect(prompt).toContain('Not specified');
      expect(prompt).toContain('None provided');
    });

    it('includes Jira data when provided', () => {
      const jiraMarkdown = '### Epics\n- [PROJ-1] Migration epic (Status: In Progress)';
      const prompt = buildUserPrompt('staff_engineer', profiles, jiraMarkdown, budget);
      expect(prompt).toContain('PROJ-1');
      expect(prompt).toContain('Migration epic');
    });

    it('notes absence of Jira data when null', () => {
      const prompt = buildUserPrompt('staff_engineer', profiles, null, budget);
      expect(prompt).toContain('No Jira data is available');
    });

    it('includes source ID reference list', () => {
      const prompt = buildUserPrompt('staff_engineer', profiles, null, budget);
      expect(prompt).toContain('`profile:Stakeholder A`');
      expect(prompt).toContain('`profile:Stakeholder B`');
    });

    it('includes output schema', () => {
      const prompt = buildUserPrompt('staff_engineer', profiles, null, budget);
      expect(prompt).toContain('"strengths"');
      expect(prompt).toContain('"weaknesses"');
      expect(prompt).toContain('SwotItem');
      expect(prompt).toContain('"confidence"');
    });
  });

  describe('buildCorrectivePrompt', () => {
    it('includes the parse error', () => {
      const prompt = buildCorrectivePrompt('Unexpected token at position 42');
      expect(prompt).toContain('Unexpected token at position 42');
      expect(prompt).toContain('could not be parsed');
    });
  });

  describe('PROMPT_VERSION', () => {
    it('is set to mvp-v1', () => {
      expect(PROMPT_VERSION).toBe('mvp-v1');
    });
  });
});
