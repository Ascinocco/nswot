import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../test/helpers/test-db';
import { AnalysisRepository } from './analysis.repository';
import { WorkspaceRepository } from './workspace.repository';
import { ProfileRepository } from './profile.repository';
import type Database from 'better-sqlite3';

describe('AnalysisRepository', () => {
  let db: Database.Database;
  let repo: AnalysisRepository;
  let workspaceId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    repo = new AnalysisRepository(db);
    const workspaceRepo = new WorkspaceRepository(db);
    const workspace = await workspaceRepo.insert('/test/workspace', 'test-workspace');
    workspaceId = workspace.id;
  });

  describe('insert and findById', () => {
    it('creates an analysis and retrieves it', async () => {
      const analysis = await repo.insert({
        workspaceId,
        role: 'staff_engineer',
        modelId: 'openai/gpt-4',
        config: { profileIds: ['p1', 'p2'], jiraProjectKeys: ['PROJ'], confluenceSpaceKeys: [], githubRepos: [] },
      });

      expect(analysis.status).toBe('pending');
      expect(analysis.role).toBe('staff_engineer');
      expect(analysis.config.profileIds).toEqual(['p1', 'p2']);

      const found = await repo.findById(analysis.id);
      expect(found).not.toBeNull();
      expect(found!.modelId).toBe('openai/gpt-4');
      expect(found!.config.jiraProjectKeys).toEqual(['PROJ']);
    });

    it('returns null for non-existent analysis', async () => {
      const found = await repo.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findByWorkspace', () => {
    it('returns analyses ordered by created_at desc', async () => {
      const a1 = await repo.insert({
        workspaceId,
        role: 'staff_engineer',
        modelId: 'model-a',
        config: { profileIds: [], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [] },
      });
      // Ensure distinct timestamps by updating created_at directly
      db.prepare('UPDATE analyses SET created_at = ? WHERE id = ?').run(
        '2024-01-01T00:00:00.000Z',
        a1.id,
      );
      await repo.insert({
        workspaceId,
        role: 'senior_em',
        modelId: 'model-b',
        config: { profileIds: [], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [] },
      });

      const analyses = await repo.findByWorkspace(workspaceId);
      expect(analyses).toHaveLength(2);
      // Most recent first
      expect(analyses[0]!.modelId).toBe('model-b');
    });

    it('returns empty for workspace with no analyses', async () => {
      const analyses = await repo.findByWorkspace(workspaceId);
      expect(analyses).toEqual([]);
    });
  });

  describe('updateStatus', () => {
    it('updates status and optional fields', async () => {
      const analysis = await repo.insert({
        workspaceId,
        role: 'staff_engineer',
        modelId: 'model-a',
        config: { profileIds: [], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [] },
      });

      const now = new Date().toISOString();
      await repo.updateStatus(analysis.id, 'running', { startedAt: now });

      const found = await repo.findById(analysis.id);
      expect(found!.status).toBe('running');
      expect(found!.startedAt).toBe(now);
    });

    it('updates error field on failure', async () => {
      const analysis = await repo.insert({
        workspaceId,
        role: 'staff_engineer',
        modelId: 'model-a',
        config: { profileIds: [], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [] },
      });

      await repo.updateStatus(analysis.id, 'failed', {
        error: 'LLM request failed',
        completedAt: new Date().toISOString(),
      });

      const found = await repo.findById(analysis.id);
      expect(found!.status).toBe('failed');
      expect(found!.error).toBe('LLM request failed');
    });
  });

  describe('storeResult', () => {
    it('stores SWOT output and marks completed', async () => {
      const analysis = await repo.insert({
        workspaceId,
        role: 'staff_engineer',
        modelId: 'model-a',
        config: { profileIds: [], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [] },
      });

      const swotOutput = {
        strengths: [
          {
            claim: 'Strong team',
            evidence: [
              {
                sourceType: 'profile' as const,
                sourceId: 'profile:Stakeholder A',
                sourceLabel: 'Stakeholder A',
                quote: 'Great team',
              },
            ],
            impact: 'High morale',
            recommendation: 'Keep it up',
            confidence: 'high' as const,
          },
        ],
        weaknesses: [],
        opportunities: [],
        threats: [],
      };

      await repo.storeResult(analysis.id, {
        swotOutput,
        summariesOutput: { profiles: 'summary', jira: 'jira summary', confluence: null, github: null },
        rawLlmResponse: '{"raw": true}',
        warning: 'Stale cache used',
      });

      const found = await repo.findById(analysis.id);
      expect(found!.status).toBe('completed');
      expect(found!.swotOutput!.strengths).toHaveLength(1);
      expect(found!.swotOutput!.strengths[0]!.claim).toBe('Strong team');
      expect(found!.summariesOutput!.profiles).toBe('summary');
      expect(found!.rawLlmResponse).toBe('{"raw": true}');
      expect(found!.warning).toBe('Stale cache used');
      expect(found!.completedAt).not.toBeNull();
    });
  });

  describe('delete', () => {
    it('removes the analysis', async () => {
      const analysis = await repo.insert({
        workspaceId,
        role: 'staff_engineer',
        modelId: 'model-a',
        config: { profileIds: [], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [] },
      });
      await repo.delete(analysis.id);
      expect(await repo.findById(analysis.id)).toBeNull();
    });
  });

  describe('findRunning', () => {
    it('finds analyses in running status', async () => {
      const a1 = await repo.insert({
        workspaceId,
        role: 'staff_engineer',
        modelId: 'model-a',
        config: { profileIds: [], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [] },
      });
      await repo.insert({
        workspaceId,
        role: 'senior_em',
        modelId: 'model-b',
        config: { profileIds: [], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [] },
      });

      await repo.updateStatus(a1.id, 'running');

      const running = await repo.findRunning();
      expect(running).toHaveLength(1);
      expect(running[0]!.id).toBe(a1.id);
    });
  });

  describe('recoverRunning', () => {
    it('marks running analyses as failed', async () => {
      const a1 = await repo.insert({
        workspaceId,
        role: 'staff_engineer',
        modelId: 'model-a',
        config: { profileIds: [], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [] },
      });
      await repo.updateStatus(a1.id, 'running');

      const count = await repo.recoverRunning();
      expect(count).toBe(1);

      const found = await repo.findById(a1.id);
      expect(found!.status).toBe('failed');
      expect(found!.error).toContain('interrupted');
    });
  });

  describe('insertProfiles and findProfiles', () => {
    it('stores and retrieves analysis-profile junction records', async () => {
      const profileRepo = new ProfileRepository(db);
      const p1 = await profileRepo.insert(workspaceId, { name: 'Alice' });
      const p2 = await profileRepo.insert(workspaceId, { name: 'Bob' });

      const analysis = await repo.insert({
        workspaceId,
        role: 'staff_engineer',
        modelId: 'model-a',
        config: { profileIds: [p1.id, p2.id], jiraProjectKeys: [], confluenceSpaceKeys: [], githubRepos: [] },
      });

      await repo.insertProfiles(analysis.id, [
        { analysisId: analysis.id, profileId: p1.id, anonymizedLabel: 'Stakeholder A' },
        { analysisId: analysis.id, profileId: p2.id, anonymizedLabel: 'Stakeholder B' },
      ]);

      const profiles = await repo.findProfiles(analysis.id);
      expect(profiles).toHaveLength(2);
      expect(profiles.map((p) => p.anonymizedLabel).sort()).toEqual([
        'Stakeholder A',
        'Stakeholder B',
      ]);
    });
  });
});
