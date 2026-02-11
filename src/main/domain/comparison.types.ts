import type { SwotItem, EvidenceSourceType } from './types';

export type SwotCategory = 'strengths' | 'weaknesses' | 'opportunities' | 'threats';

export type DeltaKind = 'added' | 'removed' | 'changed';

export interface ConfidenceDelta {
  before: SwotItem['confidence'];
  after: SwotItem['confidence'];
}

export interface SourceDelta {
  added: EvidenceSourceType[];
  removed: EvidenceSourceType[];
}

export interface ItemDelta {
  kind: DeltaKind;
  category: SwotCategory;
  claim: string;
  /** Present when kind is 'changed' — the matched item from the other analysis */
  matchedClaim?: string;
  /** Similarity score (0-1) when matched */
  similarity?: number;
  /** Confidence change — only for 'changed' items */
  confidenceDelta?: ConfidenceDelta;
  /** Source type coverage change — only for 'changed' items */
  sourceDelta?: SourceDelta;
  /** Evidence count change — only for 'changed' items */
  evidenceCountDelta?: { before: number; after: number };
}

export interface CategorySummary {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

export interface ComparisonSummary {
  strengths: CategorySummary;
  weaknesses: CategorySummary;
  opportunities: CategorySummary;
  threats: CategorySummary;
  totalAdded: number;
  totalRemoved: number;
  totalChanged: number;
  totalUnchanged: number;
}

export interface ComparisonResult {
  analysisIdA: string;
  analysisIdB: string;
  deltas: ItemDelta[];
  summary: ComparisonSummary;
  createdAt: string;
}

export interface ComparisonAnalysisSummary {
  id: string;
  role: string;
  modelId: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
}
