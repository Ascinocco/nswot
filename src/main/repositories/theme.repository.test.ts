import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../infrastructure/database';
import { ThemeRepository } from './theme.repository';
import type { ThemeOutput } from '../domain/types';

describe('ThemeRepository', () => {
  let db: Database.Database;
  let repo: ThemeRepository;
  const workspaceId = 'ws-1';
  const analysisId = 'analysis-1';

  beforeEach(() => {
    db = initializeDatabase(':memory:');
    repo = new ThemeRepository(db);

    // Insert prerequisite workspace and analysis
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

  const sampleThemes: ThemeOutput[] = [
    {
      label: 'On-call burnout',
      description: 'Multiple stakeholders report excessive on-call burden.',
      evidenceRefs: [
        { sourceType: 'profile', sourceId: 'profile:Stakeholder A', quote: 'Too many pages' },
        { sourceType: 'jira', sourceId: 'jira:OPS-42', quote: '15 incidents last sprint' },
      ],
      sourceTypes: ['profile', 'jira'],
      frequency: 2,
    },
    {
      label: 'Deploy velocity concerns',
      description: 'Deployment frequency has dropped and cycle time increased.',
      evidenceRefs: [
        { sourceType: 'github', sourceId: 'github:org/repo#100', quote: 'Average PR merge time: 5 days' },
      ],
      sourceTypes: ['github'],
      frequency: 1,
    },
  ];

  it('inserts themes and returns them with IDs', async () => {
    const result = await repo.insertMany(analysisId, sampleThemes);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBeDefined();
    expect(result[0]!.analysisId).toBe(analysisId);
    expect(result[0]!.label).toBe('On-call burnout');
    expect(result[0]!.evidenceRefs).toHaveLength(2);
    expect(result[0]!.sourceTypes).toEqual(['profile', 'jira']);
    expect(result[0]!.frequency).toBe(2);
    expect(result[0]!.createdAt).toBeDefined();
    expect(result[1]!.label).toBe('Deploy velocity concerns');
  });

  it('finds themes by analysis ordered by frequency desc then label asc', async () => {
    await repo.insertMany(analysisId, sampleThemes);

    const found = await repo.findByAnalysis(analysisId);

    expect(found).toHaveLength(2);
    // Higher frequency first
    expect(found[0]!.label).toBe('On-call burnout');
    expect(found[1]!.label).toBe('Deploy velocity concerns');
  });

  it('finds a theme by ID', async () => {
    const inserted = await repo.insertMany(analysisId, [sampleThemes[0]!]);
    const found = await repo.findById(inserted[0]!.id);

    expect(found).not.toBeNull();
    expect(found!.label).toBe('On-call burnout');
    expect(found!.description).toBe('Multiple stakeholders report excessive on-call burden.');
  });

  it('returns null for non-existent theme ID', async () => {
    const found = await repo.findById('non-existent');
    expect(found).toBeNull();
  });

  it('returns empty array when no themes exist for analysis', async () => {
    const found = await repo.findByAnalysis('no-such-analysis');
    expect(found).toEqual([]);
  });

  it('deletes themes by analysis', async () => {
    await repo.insertMany(analysisId, sampleThemes);
    await repo.deleteByAnalysis(analysisId);

    const found = await repo.findByAnalysis(analysisId);
    expect(found).toEqual([]);
  });

  it('handles empty insert', async () => {
    const result = await repo.insertMany(analysisId, []);
    expect(result).toEqual([]);
  });

  it('preserves evidence ref structure through round-trip', async () => {
    const inserted = await repo.insertMany(analysisId, [sampleThemes[0]!]);
    const found = await repo.findById(inserted[0]!.id);

    expect(found!.evidenceRefs).toEqual([
      { sourceType: 'profile', sourceId: 'profile:Stakeholder A', quote: 'Too many pages' },
      { sourceType: 'jira', sourceId: 'jira:OPS-42', quote: '15 incidents last sprint' },
    ]);
  });

  it('cascades delete when analysis is deleted', async () => {
    await repo.insertMany(analysisId, sampleThemes);

    db.prepare('DELETE FROM analyses WHERE id = ?').run(analysisId);

    const found = await repo.findByAnalysis(analysisId);
    expect(found).toEqual([]);
  });
});
