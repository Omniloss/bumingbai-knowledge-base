export type SimilarityInput = {
  sharedTopicRatio: number;
  embeddingSimilarity?: number;
  sameMediaType: boolean;
  eraRegionRatio: number;
  recommenderOverlap: boolean;
  editorial: boolean;
};

export type SimilarityScore = {
  score: number;
  reasons: string[];
};

function clampSignal(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function scoreSimilarity(
  input: SimilarityInput,
): SimilarityScore | undefined {
  const topic = clampSignal(input.sharedTopicRatio);
  const embedding = clampSignal(input.embeddingSimilarity ?? 0);
  const eraRegion = clampSignal(input.eraRegionRatio);
  const reasons: string[] = [];

  if (topic > 0) reasons.push("主题相近");
  if (input.sameMediaType) reasons.push("体裁或媒介相同");
  if (eraRegion > 0) reasons.push("时代或地域相近");
  if (input.recommenderOverlap) reasons.push("推荐人重合");
  if (input.editorial) reasons.push("人工专题关联");

  if (reasons.length === 0) return undefined;

  const score =
    topic * 0.25 +
    embedding * 0.1 +
    (input.sameMediaType ? 0.15 : 0) +
    eraRegion * 0.1 +
    (input.recommenderOverlap ? 0.1 : 0) +
    (input.editorial ? 0.1 : 0);

  return { score: clampSignal(score), reasons };
}
