import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { IntegrationCacheEntry } from '../domain/types';

interface CacheRow {
  id: string;
  integration_id: string;
  resource_type: string;
  resource_id: string;
  data: string;
  fetched_at: string;
}

function toDomain(row: CacheRow): IntegrationCacheEntry {
  return {
    id: row.id,
    integrationId: row.integration_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    data: JSON.parse(row.data) as unknown,
    fetchedAt: row.fetched_at,
  };
}

export class IntegrationCacheRepository {
  constructor(private readonly db: Database.Database) {}

  async findByType(
    integrationId: string,
    resourceType: string,
  ): Promise<IntegrationCacheEntry[]> {
    const rows = this.db
      .prepare(
        'SELECT id, integration_id, resource_type, resource_id, data, fetched_at FROM integration_cache WHERE integration_id = ? AND resource_type = ? ORDER BY fetched_at DESC',
      )
      .all(integrationId, resourceType) as CacheRow[];
    return rows.map(toDomain);
  }

  async findEntry(
    integrationId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<IntegrationCacheEntry | null> {
    const row = this.db
      .prepare(
        'SELECT id, integration_id, resource_type, resource_id, data, fetched_at FROM integration_cache WHERE integration_id = ? AND resource_type = ? AND resource_id = ?',
      )
      .get(integrationId, resourceType, resourceId) as CacheRow | undefined;
    return row ? toDomain(row) : null;
  }

  async upsert(
    integrationId: string,
    resourceType: string,
    resourceId: string,
    data: unknown,
  ): Promise<void> {
    const now = new Date().toISOString();
    const dataJson = JSON.stringify(data);

    const existing = this.db
      .prepare(
        'SELECT id FROM integration_cache WHERE integration_id = ? AND resource_type = ? AND resource_id = ?',
      )
      .get(integrationId, resourceType, resourceId) as { id: string } | undefined;

    if (existing) {
      this.db
        .prepare('UPDATE integration_cache SET data = ?, fetched_at = ? WHERE id = ?')
        .run(dataJson, now, existing.id);
    } else {
      const id = randomUUID();
      this.db
        .prepare(
          'INSERT INTO integration_cache (id, integration_id, resource_type, resource_id, data, fetched_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(id, integrationId, resourceType, resourceId, dataJson, now);
    }
  }

  async countByIntegration(integrationId: string): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM integration_cache WHERE integration_id = ?')
      .get(integrationId) as { count: number };
    return row.count;
  }

  async pruneOldest(integrationId: string, maxEntries = 5000): Promise<void> {
    const count = await this.countByIntegration(integrationId);
    if (count <= maxEntries) return;

    const excess = count - maxEntries;
    this.db
      .prepare(
        'DELETE FROM integration_cache WHERE id IN (SELECT id FROM integration_cache WHERE integration_id = ? ORDER BY fetched_at ASC LIMIT ?)',
      )
      .run(integrationId, excess);
  }

  async deleteByIntegration(integrationId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM integration_cache WHERE integration_id = ?')
      .run(integrationId);
  }

  static isStale(entry: IntegrationCacheEntry, ttlMs = 3_600_000): boolean {
    const fetchedAt = new Date(entry.fetchedAt).getTime();
    return Date.now() - fetchedAt > ttlMs;
  }
}
