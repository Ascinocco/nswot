import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type {
  Analysis,
  AnalysisConfig,
  AnalysisProfile,
  SwotOutput,
  SummariesOutput,
  AnonymizedPayload,
  EvidenceQualityMetrics,
} from '../domain/types';
import type { ComparisonAnalysisSummary } from '../domain/comparison.types';

interface AnalysisRow {
  id: string;
  workspace_id: string;
  role: string;
  model_id: string;
  status: string;
  config: string;
  input_snapshot: string | null;
  swot_output: string | null;
  summaries_output: string | null;
  quality_metrics: string | null;
  raw_llm_response: string | null;
  warning: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ComparisonRow {
  id: string;
  role: string;
  model_id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface AnalysisProfileRow {
  analysis_id: string;
  profile_id: string;
  anonymized_label: string;
}

function toDomain(row: AnalysisRow): Analysis {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    role: row.role as Analysis['role'],
    modelId: row.model_id,
    status: row.status as Analysis['status'],
    config: JSON.parse(row.config) as AnalysisConfig,
    inputSnapshot: row.input_snapshot
      ? (JSON.parse(row.input_snapshot) as AnonymizedPayload)
      : null,
    swotOutput: row.swot_output ? (JSON.parse(row.swot_output) as SwotOutput) : null,
    summariesOutput: row.summaries_output
      ? (JSON.parse(row.summaries_output) as SummariesOutput)
      : null,
    qualityMetrics: row.quality_metrics
      ? (JSON.parse(row.quality_metrics) as EvidenceQualityMetrics)
      : null,
    rawLlmResponse: row.raw_llm_response,
    warning: row.warning,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function toProfileDomain(row: AnalysisProfileRow): AnalysisProfile {
  return {
    analysisId: row.analysis_id,
    profileId: row.profile_id,
    anonymizedLabel: row.anonymized_label,
  };
}

export class AnalysisRepository {
  constructor(private readonly db: Database.Database) {}

  async findByWorkspace(workspaceId: string): Promise<Analysis[]> {
    const rows = this.db
      .prepare(
        'SELECT id, workspace_id, role, model_id, status, config, input_snapshot, swot_output, summaries_output, quality_metrics, raw_llm_response, warning, error, started_at, completed_at, created_at FROM analyses WHERE workspace_id = ? ORDER BY created_at DESC',
      )
      .all(workspaceId) as AnalysisRow[];
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Analysis | null> {
    const row = this.db
      .prepare(
        'SELECT id, workspace_id, role, model_id, status, config, input_snapshot, swot_output, summaries_output, quality_metrics, raw_llm_response, warning, error, started_at, completed_at, created_at FROM analyses WHERE id = ?',
      )
      .get(id) as AnalysisRow | undefined;
    return row ? toDomain(row) : null;
  }

  async insert(params: {
    workspaceId: string;
    role: Analysis['role'];
    modelId: string;
    config: AnalysisConfig;
  }): Promise<Analysis> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const configJson = JSON.stringify(params.config);
    this.db
      .prepare(
        'INSERT INTO analyses (id, workspace_id, role, model_id, status, config, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, params.workspaceId, params.role, params.modelId, 'pending', configJson, now);
    return {
      id,
      workspaceId: params.workspaceId,
      role: params.role,
      modelId: params.modelId,
      status: 'pending',
      config: params.config,
      inputSnapshot: null,
      swotOutput: null,
      summariesOutput: null,
      qualityMetrics: null,
      rawLlmResponse: null,
      warning: null,
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
    };
  }

  async updateStatus(
    id: string,
    status: Analysis['status'],
    fields?: Partial<Pick<Analysis, 'error' | 'warning' | 'startedAt' | 'completedAt' | 'inputSnapshot'>>,
  ): Promise<void> {
    const sets = ['status = ?'];
    const values: unknown[] = [status];

    if (fields?.error !== undefined) {
      sets.push('error = ?');
      values.push(fields.error);
    }
    if (fields?.warning !== undefined) {
      sets.push('warning = ?');
      values.push(fields.warning);
    }
    if (fields?.startedAt !== undefined) {
      sets.push('started_at = ?');
      values.push(fields.startedAt);
    }
    if (fields?.completedAt !== undefined) {
      sets.push('completed_at = ?');
      values.push(fields.completedAt);
    }
    if (fields?.inputSnapshot !== undefined) {
      sets.push('input_snapshot = ?');
      values.push(JSON.stringify(fields.inputSnapshot));
    }

    values.push(id);
    this.db.prepare(`UPDATE analyses SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  async storeResult(
    id: string,
    output: {
      swotOutput: SwotOutput;
      summariesOutput: SummariesOutput;
      qualityMetrics: EvidenceQualityMetrics;
      rawLlmResponse: string;
      warning?: string;
    },
  ): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .prepare(
        'UPDATE analyses SET status = ?, swot_output = ?, summaries_output = ?, quality_metrics = ?, raw_llm_response = ?, warning = ?, completed_at = ? WHERE id = ?',
      )
      .run(
        'completed',
        JSON.stringify(output.swotOutput),
        JSON.stringify(output.summariesOutput),
        JSON.stringify(output.qualityMetrics),
        output.rawLlmResponse,
        output.warning ?? null,
        now,
        id,
      );
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM analyses WHERE id = ?').run(id);
  }

  async findRunning(): Promise<Analysis[]> {
    const rows = this.db
      .prepare(
        'SELECT id, workspace_id, role, model_id, status, config, input_snapshot, swot_output, summaries_output, quality_metrics, raw_llm_response, warning, error, started_at, completed_at, created_at FROM analyses WHERE status = ?',
      )
      .all('running') as AnalysisRow[];
    return rows.map(toDomain);
  }

  async insertProfiles(analysisId: string, profiles: AnalysisProfile[]): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT INTO analysis_profiles (analysis_id, profile_id, anonymized_label) VALUES (?, ?, ?)',
    );
    const insertAll = this.db.transaction(() => {
      for (const p of profiles) {
        stmt.run(analysisId, p.profileId, p.anonymizedLabel);
      }
    });
    insertAll();
  }

  async findProfiles(analysisId: string): Promise<AnalysisProfile[]> {
    const rows = this.db
      .prepare(
        'SELECT analysis_id, profile_id, anonymized_label FROM analysis_profiles WHERE analysis_id = ?',
      )
      .all(analysisId) as AnalysisProfileRow[];
    return rows.map(toProfileDomain);
  }

  async recoverRunning(): Promise<number> {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        "UPDATE analyses SET status = 'failed', error = 'Analysis interrupted — app was closed while running. Please re-run.', completed_at = ? WHERE status = 'running'",
      )
      .run(now);
    return result.changes;
  }

  async findForComparison(workspaceId: string): Promise<ComparisonAnalysisSummary[]> {
    const rows = this.db
      .prepare(
        "SELECT id, role, model_id, status, created_at, completed_at FROM analyses WHERE workspace_id = ? AND status = 'completed' ORDER BY completed_at DESC",
      )
      .all(workspaceId) as ComparisonRow[];
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      modelId: row.model_id,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }));
  }
}
