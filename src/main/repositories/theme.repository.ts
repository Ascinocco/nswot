import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { Theme, ThemeOutput, ThemeEvidenceRef, EvidenceSourceType } from '../domain/types';

interface ThemeRow {
  id: string;
  analysis_id: string;
  label: string;
  description: string;
  evidence_refs: string;
  source_types: string;
  frequency: number;
  created_at: string;
}

function toDomain(row: ThemeRow): Theme {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    label: row.label,
    description: row.description,
    evidenceRefs: JSON.parse(row.evidence_refs) as ThemeEvidenceRef[],
    sourceTypes: JSON.parse(row.source_types) as EvidenceSourceType[],
    frequency: row.frequency,
    createdAt: row.created_at,
  };
}

export class ThemeRepository {
  constructor(private readonly db: Database.Database) {}

  async insertMany(analysisId: string, themes: ThemeOutput[]): Promise<Theme[]> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      `INSERT INTO themes (id, analysis_id, label, description, evidence_refs, source_types, frequency, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const results: Theme[] = [];
    const insertAll = this.db.transaction(() => {
      for (const theme of themes) {
        const id = randomUUID();
        stmt.run(
          id,
          analysisId,
          theme.label,
          theme.description,
          JSON.stringify(theme.evidenceRefs),
          JSON.stringify(theme.sourceTypes),
          theme.frequency,
          now,
        );
        results.push({
          id,
          analysisId,
          label: theme.label,
          description: theme.description,
          evidenceRefs: theme.evidenceRefs,
          sourceTypes: theme.sourceTypes,
          frequency: theme.frequency,
          createdAt: now,
        });
      }
    });
    insertAll();

    return results;
  }

  async findByAnalysis(analysisId: string): Promise<Theme[]> {
    const rows = this.db
      .prepare(
        'SELECT id, analysis_id, label, description, evidence_refs, source_types, frequency, created_at FROM themes WHERE analysis_id = ? ORDER BY frequency DESC, label ASC',
      )
      .all(analysisId) as ThemeRow[];
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Theme | null> {
    const row = this.db
      .prepare(
        'SELECT id, analysis_id, label, description, evidence_refs, source_types, frequency, created_at FROM themes WHERE id = ?',
      )
      .get(id) as ThemeRow | undefined;
    return row ? toDomain(row) : null;
  }

  async deleteByAnalysis(analysisId: string): Promise<void> {
    this.db.prepare('DELETE FROM themes WHERE analysis_id = ?').run(analysisId);
  }
}
