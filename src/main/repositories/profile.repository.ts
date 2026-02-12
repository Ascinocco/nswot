import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { Profile, ProfileInput } from '../domain/types';

interface ProfileRow {
  id: string;
  workspace_id: string;
  name: string;
  role: string | null;
  team: string | null;
  concerns: string | null;
  priorities: string | null;
  interview_quotes: string;
  tags: string;
  notes: string | null;
  source_file: string | null;
  created_at: string;
  updated_at: string;
}

function toDomain(row: ProfileRow): Profile {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    role: row.role,
    team: row.team,
    concerns: row.concerns,
    priorities: row.priorities,
    interviewQuotes: JSON.parse(row.interview_quotes) as string[],
    tags: JSON.parse(row.tags) as string[],
    notes: row.notes,
    sourceFile: row.source_file,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProfileRepository {
  constructor(private readonly db: Database.Database) {}

  async findByWorkspace(workspaceId: string): Promise<Profile[]> {
    const rows = this.db
      .prepare(
        'SELECT id, workspace_id, name, role, team, concerns, priorities, interview_quotes, tags, notes, source_file, created_at, updated_at FROM profiles WHERE workspace_id = ? ORDER BY created_at DESC',
      )
      .all(workspaceId) as ProfileRow[];
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Profile | null> {
    const row = this.db
      .prepare(
        'SELECT id, workspace_id, name, role, team, concerns, priorities, interview_quotes, tags, notes, source_file, created_at, updated_at FROM profiles WHERE id = ?',
      )
      .get(id) as ProfileRow | undefined;
    return row ? toDomain(row) : null;
  }

  async findByIds(ids: string[]): Promise<Profile[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT id, workspace_id, name, role, team, concerns, priorities, interview_quotes, tags, notes, source_file, created_at, updated_at FROM profiles WHERE id IN (${placeholders})`,
      )
      .all(...ids) as ProfileRow[];
    return rows.map(toDomain);
  }

  async insert(workspaceId: string, input: ProfileInput): Promise<Profile> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const quotes = JSON.stringify(input.interviewQuotes ?? []);
    const tags = JSON.stringify(input.tags ?? []);
    this.db
      .prepare(
        'INSERT INTO profiles (id, workspace_id, name, role, team, concerns, priorities, interview_quotes, tags, notes, source_file, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        workspaceId,
        input.name,
        input.role ?? null,
        input.team ?? null,
        input.concerns ?? null,
        input.priorities ?? null,
        quotes,
        tags,
        input.notes ?? null,
        input.sourceFile ?? null,
        now,
        now,
      );
    return {
      id,
      workspaceId,
      name: input.name,
      role: input.role ?? null,
      team: input.team ?? null,
      concerns: input.concerns ?? null,
      priorities: input.priorities ?? null,
      interviewQuotes: input.interviewQuotes ?? [],
      tags: input.tags ?? [],
      notes: input.notes ?? null,
      sourceFile: input.sourceFile ?? null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(id: string, input: ProfileInput): Promise<Profile | null> {
    const now = new Date().toISOString();
    const quotes = JSON.stringify(input.interviewQuotes ?? []);
    const tags = JSON.stringify(input.tags ?? []);
    const result = this.db
      .prepare(
        'UPDATE profiles SET name = ?, role = ?, team = ?, concerns = ?, priorities = ?, interview_quotes = ?, tags = ?, notes = ?, source_file = ?, updated_at = ? WHERE id = ?',
      )
      .run(
        input.name,
        input.role ?? null,
        input.team ?? null,
        input.concerns ?? null,
        input.priorities ?? null,
        quotes,
        tags,
        input.notes ?? null,
        input.sourceFile ?? null,
        now,
        id,
      );
    if (result.changes === 0) return null;
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
  }

  async countByWorkspace(workspaceId: string): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM profiles WHERE workspace_id = ?')
      .get(workspaceId) as { count: number };
    return row.count;
  }
}
