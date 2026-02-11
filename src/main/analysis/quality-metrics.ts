import type { SwotOutput, SwotItem, EvidenceQualityMetrics } from '../domain/types';

const QUADRANTS = ['strengths', 'weaknesses', 'opportunities', 'threats'] as const;

export function computeQualityMetrics(swotOutput: SwotOutput): EvidenceQualityMetrics {
  const allItems: SwotItem[] = [];
  for (const quadrant of QUADRANTS) {
    allItems.push(...swotOutput[quadrant]);
  }

  const totalItems = allItems.length;
  if (totalItems === 0) {
    return {
      totalItems: 0,
      multiSourceItems: 0,
      sourceTypeCoverage: {},
      confidenceDistribution: { high: 0, medium: 0, low: 0 },
      averageEvidencePerItem: 0,
      qualityScore: 0,
    };
  }

  let multiSourceItems = 0;
  let totalEvidence = 0;
  const sourceTypeCoverage: Record<string, number> = {};
  const confidenceDistribution = { high: 0, medium: 0, low: 0 };

  for (const item of allItems) {
    // Count evidence
    totalEvidence += item.evidence.length;

    // Confidence distribution
    confidenceDistribution[item.confidence] += 1;

    // Determine distinct source types for this item
    const sourceTypes = new Set(item.evidence.map((e) => e.sourceType));

    // Multi-source: 2+ distinct source types
    if (sourceTypes.size >= 2) {
      multiSourceItems += 1;
    }

    // Source type coverage: how many items cite each type
    for (const st of sourceTypes) {
      sourceTypeCoverage[st] = (sourceTypeCoverage[st] ?? 0) + 1;
    }
  }

  const averageEvidencePerItem = totalEvidence / totalItems;

  // Quality score (0-100 composite)
  // Components:
  //   - Multi-source ratio (0-40): % of items with 2+ source types × 40
  //   - Evidence density (0-30): min(averageEvidencePerItem / 3, 1) × 30
  //   - High-confidence ratio (0-30): % of high-confidence items × 30
  const multiSourceRatio = multiSourceItems / totalItems;
  const evidenceDensity = Math.min(averageEvidencePerItem / 3, 1);
  const highConfidenceRatio = confidenceDistribution.high / totalItems;

  const qualityScore = Math.round(
    multiSourceRatio * 40 + evidenceDensity * 30 + highConfidenceRatio * 30,
  );

  return {
    totalItems,
    multiSourceItems,
    sourceTypeCoverage,
    confidenceDistribution,
    averageEvidencePerItem: Math.round(averageEvidencePerItem * 100) / 100,
    qualityScore,
  };
}
