import type { AnalysisRepository } from '../repositories/analysis.repository';
import type { Analysis, SwotItem, EvidenceSourceType } from '../domain/types';
import type {
  ComparisonResult,
  ComparisonSummary,
  CategorySummary,
  ItemDelta,
  SwotCategory,
  ConfidenceDelta,
  SourceDelta,
} from '../domain/comparison.types';
import { ok, err, type Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';

const SIMILARITY_THRESHOLD = 0.4;

const SWOT_CATEGORIES: SwotCategory[] = ['strengths', 'weaknesses', 'opportunities', 'threats'];

export class ComparisonService {
  constructor(private readonly analysisRepo: AnalysisRepository) {}

  async compare(
    analysisIdA: string,
    analysisIdB: string,
  ): Promise<Result<ComparisonResult, DomainError>> {
    const [analysisA, analysisB] = await Promise.all([
      this.analysisRepo.findById(analysisIdA),
      this.analysisRepo.findById(analysisIdB),
    ]);

    if (!analysisA) {
      return err(new DomainError(ERROR_CODES.ANALYSIS_NOT_FOUND, `Analysis ${analysisIdA} not found`));
    }
    if (!analysisB) {
      return err(new DomainError(ERROR_CODES.ANALYSIS_NOT_FOUND, `Analysis ${analysisIdB} not found`));
    }
    if (analysisA.status !== 'completed' || !analysisA.swotOutput) {
      return err(new DomainError(ERROR_CODES.ANALYSIS_NOT_FOUND, `Analysis ${analysisIdA} is not completed`));
    }
    if (analysisB.status !== 'completed' || !analysisB.swotOutput) {
      return err(new DomainError(ERROR_CODES.ANALYSIS_NOT_FOUND, `Analysis ${analysisIdB} is not completed`));
    }

    const deltas: ItemDelta[] = [];

    for (const category of SWOT_CATEGORIES) {
      const itemsA = analysisA.swotOutput[category];
      const itemsB = analysisB.swotOutput[category];
      const categoryDeltas = diffCategory(category, itemsA, itemsB);
      deltas.push(...categoryDeltas);
    }

    const summary = buildSummary(deltas);

    return ok({
      analysisIdA,
      analysisIdB,
      deltas,
      summary,
      createdAt: new Date().toISOString(),
    });
  }
}

function diffCategory(
  category: SwotCategory,
  itemsA: SwotItem[],
  itemsB: SwotItem[],
): ItemDelta[] {
  const deltas: ItemDelta[] = [];
  const matchedB = new Set<number>();

  for (const itemA of itemsA) {
    let bestMatch: { index: number; score: number } | null = null;

    for (let j = 0; j < itemsB.length; j++) {
      if (matchedB.has(j)) continue;
      const candidate = itemsB[j]!;
      const score = claimSimilarity(itemA.claim, candidate.claim);
      if (score >= SIMILARITY_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { index: j, score };
      }
    }

    if (bestMatch) {
      matchedB.add(bestMatch.index);
      const itemB = itemsB[bestMatch.index]!;
      const hasChanges =
        itemA.confidence !== itemB.confidence ||
        !sameSourceTypes(itemA, itemB) ||
        itemA.evidence.length !== itemB.evidence.length;

      if (hasChanges) {
        deltas.push({
          kind: 'changed',
          category,
          claim: itemA.claim,
          matchedClaim: itemB.claim,
          similarity: bestMatch.score,
          confidenceDelta: buildConfidenceDelta(itemA, itemB),
          sourceDelta: buildSourceDelta(itemA, itemB),
          evidenceCountDelta: {
            before: itemA.evidence.length,
            after: itemB.evidence.length,
          },
        });
      }
      // If no changes detected, the item is unchanged — we skip it from deltas
    } else {
      deltas.push({
        kind: 'removed',
        category,
        claim: itemA.claim,
      });
    }
  }

  for (let j = 0; j < itemsB.length; j++) {
    if (!matchedB.has(j)) {
      deltas.push({
        kind: 'added',
        category,
        claim: itemsB[j]!.claim,
      });
    }
  }

  return deltas;
}

function buildConfidenceDelta(
  itemA: SwotItem,
  itemB: SwotItem,
): ConfidenceDelta | undefined {
  if (itemA.confidence === itemB.confidence) return undefined;
  return { before: itemA.confidence, after: itemB.confidence };
}

function buildSourceDelta(
  itemA: SwotItem,
  itemB: SwotItem,
): SourceDelta | undefined {
  const typesA = new Set(itemA.evidence.map((e) => e.sourceType));
  const typesB = new Set(itemB.evidence.map((e) => e.sourceType));

  const added: EvidenceSourceType[] = [];
  const removed: EvidenceSourceType[] = [];

  for (const t of typesB) {
    if (!typesA.has(t)) added.push(t);
  }
  for (const t of typesA) {
    if (!typesB.has(t)) removed.push(t);
  }

  if (added.length === 0 && removed.length === 0) return undefined;
  return { added, removed };
}

function sameSourceTypes(itemA: SwotItem, itemB: SwotItem): boolean {
  const typesA = new Set(itemA.evidence.map((e) => e.sourceType));
  const typesB = new Set(itemB.evidence.map((e) => e.sourceType));
  if (typesA.size !== typesB.size) return false;
  for (const t of typesA) {
    if (!typesB.has(t)) return false;
  }
  return true;
}

function buildSummary(deltas: ItemDelta[]): ComparisonSummary {
  const categorySummaries: Record<SwotCategory, CategorySummary> = {
    strengths: { added: 0, removed: 0, changed: 0, unchanged: 0 },
    weaknesses: { added: 0, removed: 0, changed: 0, unchanged: 0 },
    opportunities: { added: 0, removed: 0, changed: 0, unchanged: 0 },
    threats: { added: 0, removed: 0, changed: 0, unchanged: 0 },
  };

  for (const delta of deltas) {
    categorySummaries[delta.category][delta.kind]++;
  }

  let totalAdded = 0;
  let totalRemoved = 0;
  let totalChanged = 0;
  let totalUnchanged = 0;

  for (const cat of SWOT_CATEGORIES) {
    totalAdded += categorySummaries[cat].added;
    totalRemoved += categorySummaries[cat].removed;
    totalChanged += categorySummaries[cat].changed;
    totalUnchanged += categorySummaries[cat].unchanged;
  }

  return {
    ...categorySummaries,
    totalAdded,
    totalRemoved,
    totalChanged,
    totalUnchanged,
  };
}

/**
 * Compute text similarity between two claims using a combination of
 * normalized longest common substring and word overlap (Jaccard).
 * Returns a score between 0 and 1.
 */
export function claimSimilarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);

  if (normA === normB) return 1;
  if (normA.length === 0 || normB.length === 0) return 0;

  // Substring containment check
  if (normA.includes(normB) || normB.includes(normA)) {
    const shorter = Math.min(normA.length, normB.length);
    const longer = Math.max(normA.length, normB.length);
    return shorter / longer;
  }

  // Word-level Jaccard similarity
  const wordsA = new Set(normA.split(/\s+/));
  const wordsB = new Set(normB.split(/\s+/));
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;

  // Levenshtein-based similarity (bounded computation for long strings)
  const lenSim = levenshteinSimilarity(normA, normB);

  // Weighted combination: Jaccard is more useful for claim comparison
  return 0.6 * jaccard + 0.4 * lenSim;
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^\w\s]/g, '');
}

function levenshteinSimilarity(a: string, b: string): number {
  // For very long strings, use a bounded approach
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  if (maxLen > 500) {
    // Fall back to just Jaccard for very long strings
    return 0;
  }

  const dist = levenshteinDistance(a, b);
  return 1 - dist / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Use single row optimization
  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  let curr: number[] = new Array(n + 1).fill(0) as number[];

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1, // deletion
        curr[j - 1]! + 1, // insertion
        prev[j - 1]! + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n]!;
}
