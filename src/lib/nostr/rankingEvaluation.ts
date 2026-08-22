export interface RankingMetrics {
  reciprocalRank: number;
  precisionAtK: number;
  ndcgAtK: number;
}

export interface GradedRelevanceJudgment {
  id: string;
  relevance: number;
}

function uniqueRelevantIds(relevantIds: string[]): Set<string> {
  return new Set(relevantIds.filter((id) => id.length > 0));
}

/** Mean reciprocal rank for the first relevant result. */
export function reciprocalRank(rankedIds: string[], relevantIds: string[]): number {
  const relevant = uniqueRelevantIds(relevantIds);
  const index = rankedIds.findIndex((id) => relevant.has(id));
  return index < 0 ? 0 : 1 / (index + 1);
}

/** Binary precision over the first k ranked results. */
export function precisionAtK(rankedIds: string[], relevantIds: string[], k: number): number {
  const cutoff = Math.max(0, Math.floor(k));
  if (cutoff === 0) return 0;
  const relevant = uniqueRelevantIds(relevantIds);
  const hits = rankedIds.slice(0, cutoff).filter((id) => relevant.has(id)).length;
  return hits / cutoff;
}

/** Binary-gain nDCG over the first k ranked results. */
export function ndcgAtK(rankedIds: string[], relevantIds: string[], k: number): number {
  const cutoff = Math.max(0, Math.floor(k));
  if (cutoff === 0 || relevantIds.length === 0) return 0;
  const relevant = uniqueRelevantIds(relevantIds);
  const discountedGain = rankedIds
    .slice(0, cutoff)
    .reduce((total, id, index) => total + (relevant.has(id) ? 1 / Math.log2(index + 2) : 0), 0);
  const idealGain = Array.from({ length: Math.min(cutoff, relevant.size) }, (_, index) => 1 / Math.log2(index + 2))
    .reduce((total, gain) => total + gain, 0);
  return idealGain === 0 ? 0 : discountedGain / idealGain;
}

export function evaluateRanking(rankedIds: string[], relevantIds: string[], k = 10): RankingMetrics {
  return {
    reciprocalRank: reciprocalRank(rankedIds, relevantIds),
    precisionAtK: precisionAtK(rankedIds, relevantIds, k),
    ndcgAtK: ndcgAtK(rankedIds, relevantIds, k)
  };
}

/** Graded nDCG for hand-labelled relevance judgments, where higher is better. */
export function gradedNdcgAtK(
  rankedIds: string[],
  judgments: GradedRelevanceJudgment[],
  k: number
): number {
  const cutoff = Math.max(0, Math.floor(k));
  if (cutoff === 0 || judgments.length === 0) return 0;
  const relevance = new Map(judgments.map((judgment) => [judgment.id, Math.max(0, judgment.relevance)]));
  const gain = (score: number) => (2 ** score) - 1;
  const discountedGain = rankedIds
    .slice(0, cutoff)
    .reduce((total, id, index) => total + gain(relevance.get(id) ?? 0) / Math.log2(index + 2), 0);
  const idealGain = judgments
    .map((judgment) => gain(judgment.relevance))
    .sort((a, b) => b - a)
    .slice(0, cutoff)
    .reduce((total, score, index) => total + score / Math.log2(index + 2), 0);
  return idealGain === 0 ? 0 : discountedGain / idealGain;
}
