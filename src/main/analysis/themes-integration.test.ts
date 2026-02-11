import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../infrastructure/database';
import { ThemeRepository } from '../repositories/theme.repository';
import { ThemeExtractionStep } from './steps/theme-extraction';
import type { PipelineContext, LlmCaller, LlmResponse } from './pipeline-step';

const VALID_THEME_RESPONSE = `\`\`\`json
{
  "themes": [
    {
      "label": "On-call burnout",
      "description": "Multiple stakeholders report excessive on-call burden affecting team morale and productivity.",
      "evidenceRefs": [
        { "sourceType": "profile", "sourceId": "profile:Stakeholder A", "quote": "We are exhausted from on-call rotations" },
        { "sourceType": "jira", "sourceId": "jira:OPS-42", "quote": "15 incidents in last sprint" }
      ],
      "frequency": 2
    },
    {
      "label": "Deploy velocity concerns",
      "description": "Deployment frequency has declined and cycle time increased over the last quarter.",
      "evidenceRefs": [
        { "sourceType": "jira", "sourceId": "jira:PROJ-101", "quote": "Deploy count dropped from 10/week to 3/week" },
        { "sourceType": "profile", "sourceId": "profile:Stakeholder B", "quote": "We used to deploy daily, now it takes a week" },
        { "sourceType": "github", "sourceId": "github:org/repo#50", "quote": "Average PR merge time: 5 days" }
      ],
      "frequency": 3
    },
    {
      "label": "Strong testing culture",
      "description": "The team has built a strong culture of automated testing with high coverage.",
      "evidenceRefs": [
        { "sourceType": "profile", "sourceId": "profile:Stakeholder B", "quote": "Our test coverage is industry-leading" }
      ],
      "frequency": 1
    }
  ]
}
\`\`\``;

function makeContext(llmCaller: LlmCaller): PipelineContext {
  return {
    analysisId: 'analysis-themes',
    role: 'staff_engineer',
    modelId: 'openai/gpt-4',
    contextWindow: 128000,
    anonymizedProfiles: [
      {
        label: 'Stakeholder A',
        role: 'Engineer',
        team: 'Platform',
        concerns: 'On-call burden',
        priorities: 'Reliability',
        quotes: ['We are exhausted from on-call rotations'],
        notes: null,
      },
      {
        label: 'Stakeholder B',
        role: 'Senior Engineer',
        team: 'Quality',
        concerns: 'Deploy speed',
        priorities: 'Testing',
        quotes: ['Our test coverage is industry-leading', 'We used to deploy daily, now it takes a week'],
        notes: null,
      },
    ],
    inputSnapshot: {
      profiles: [],
      jiraData: null,
      confluenceData: null,
      githubData: null,
      codebaseData: null,
      pseudonymMap: {},
    },
    dataSources: {
      jiraDataMarkdown: '### Stories\n- [OPS-42] Incident tracking\n- [PROJ-101] Deploy metrics',
      confluenceDataMarkdown: null,
      githubDataMarkdown: '### Pull Requests\n- [org/repo#50] Slow merge (State: merged)',
      codebaseDataMarkdown: null,
    },
    connectedSources: ['jira', 'github'],
    llmCaller,
  };
}

describe('Themes extraction + storage integration', () => {
  let db: Database.Database;
  let themeRepo: ThemeRepository;
  const workspaceId = 'ws-themes';
  const analysisId = 'analysis-themes';

  beforeEach(() => {
    db = initializeDatabase(':memory:');
    themeRepo = new ThemeRepository(db);

    // Insert prerequisite records
    db.prepare(
      "INSERT INTO workspaces (id, path, name) VALUES (?, ?, ?)",
    ).run(workspaceId, '/tmp/test', 'Test Workspace');
    db.prepare(
      "INSERT INTO analyses (id, workspace_id, role, model_id, status) VALUES (?, ?, ?, ?, ?)",
    ).run(analysisId, workspaceId, 'staff_engineer', 'openai/gpt-4', 'completed');
  });

  afterEach(() => {
    db.close();
  });

  it('ThemeExtractionStep produces themes from mocked LLM response', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn().mockResolvedValue({
        content: VALID_THEME_RESPONSE,
        finishReason: 'stop',
      } satisfies LlmResponse),
    };

    const step = new ThemeExtractionStep();
    const result = await step.execute(makeContext(llmCaller), vi.fn());

    expect(result.themes).toBeDefined();
    expect(result.themes).toHaveLength(3);
    expect(result.themes![0]!.label).toBe('On-call burnout');
    expect(result.themes![1]!.label).toBe('Deploy velocity concerns');
    expect(result.themes![2]!.label).toBe('Strong testing culture');
  });

  it('extracted themes can be stored and retrieved via ThemeRepository', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn().mockResolvedValue({
        content: VALID_THEME_RESPONSE,
        finishReason: 'stop',
      }),
    };

    const step = new ThemeExtractionStep();
    const result = await step.execute(makeContext(llmCaller), vi.fn());

    // Store themes
    const stored = await themeRepo.insertMany(analysisId, result.themes!);
    expect(stored).toHaveLength(3);

    // Retrieve themes
    const retrieved = await themeRepo.findByAnalysis(analysisId);
    expect(retrieved).toHaveLength(3);

    // Verify structure
    const oncall = retrieved.find((t) => t.label === 'On-call burnout');
    expect(oncall).toBeDefined();
    expect(oncall!.description).toContain('on-call burden');
    expect(oncall!.evidenceRefs).toHaveLength(2);
    expect(oncall!.sourceTypes).toContain('profile');
    expect(oncall!.sourceTypes).toContain('jira');
    expect(oncall!.frequency).toBe(2);

    const deploy = retrieved.find((t) => t.label === 'Deploy velocity concerns');
    expect(deploy!.evidenceRefs).toHaveLength(3);
    expect(deploy!.frequency).toBe(3);
  });

  it('themes can be updated (editable)', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn().mockResolvedValue({
        content: VALID_THEME_RESPONSE,
        finishReason: 'stop',
      }),
    };

    const step = new ThemeExtractionStep();
    const result = await step.execute(makeContext(llmCaller), vi.fn());
    const stored = await themeRepo.insertMany(analysisId, result.themes!);

    // Update the first theme
    const themeId = stored[0]!.id;
    const updated = await themeRepo.update(themeId, {
      label: 'On-call fatigue (updated)',
      description: 'Updated description reflecting recent changes.',
    });

    expect(updated).not.toBeNull();
    expect(updated!.label).toBe('On-call fatigue (updated)');
    expect(updated!.description).toBe('Updated description reflecting recent changes.');

    // Verify via findByAnalysis
    const all = await themeRepo.findByAnalysis(analysisId);
    const found = all.find((t) => t.id === themeId);
    expect(found!.label).toBe('On-call fatigue (updated)');
  });

  it('themes can be deleted', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn().mockResolvedValue({
        content: VALID_THEME_RESPONSE,
        finishReason: 'stop',
      }),
    };

    const step = new ThemeExtractionStep();
    const result = await step.execute(makeContext(llmCaller), vi.fn());
    const stored = await themeRepo.insertMany(analysisId, result.themes!);

    expect(stored).toHaveLength(3);

    // Delete one theme
    await themeRepo.deleteById(stored[0]!.id);

    const remaining = await themeRepo.findByAnalysis(analysisId);
    expect(remaining).toHaveLength(2);
    expect(remaining.find((t) => t.id === stored[0]!.id)).toBeUndefined();
  });
});
