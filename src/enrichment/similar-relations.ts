import { createStableId } from "../domain/id.js";
import { canPublishRecommendation } from "../domain/publication.js";
import type { Catalog, Work, WorkRelation } from "../domain/schemas/catalog.js";
import type { SourceRef } from "../domain/schemas/primitives.js";
import { scoreSimilarity } from "../relations/similarity.js";

function ratio(left: readonly string[], right: readonly string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const value of leftSet) if (rightSet.has(value)) intersection += 1;
  return intersection / union.size;
}

function eraRegionRatio(left: Work, right: Work): number {
  const signals: number[] = [];
  if (left.year !== undefined && right.year !== undefined) {
    signals.push(
      Math.floor(left.year / 10) === Math.floor(right.year / 10) ? 1 : 0,
    );
  }
  if (left.regions.length > 0 && right.regions.length > 0) {
    signals.push(ratio(left.regions, right.regions));
  }
  return signals.length === 0
    ? 0
    : signals.reduce((sum, value) => sum + value, 0) / signals.length;
}

function sourceKey(source: SourceRef): string {
  return JSON.stringify([
    source.kind,
    source.url,
    source.retrievedAt,
    source.locator ?? null,
  ]);
}

function stableSources(sources: readonly SourceRef[]): SourceRef[] {
  return [
    ...new Map(sources.map((source) => [sourceKey(source), source])).values(),
  ].toSorted((left, right) => sourceKey(left).localeCompare(sourceKey(right)));
}

function pairKey(leftId: string, rightId: string): string {
  return leftId < rightId
    ? `${leftId}\u001f${rightId}`
    : `${rightId}\u001f${leftId}`;
}

function cosine(
  left: readonly number[] | undefined,
  right: readonly number[] | undefined,
): number | undefined {
  if (
    left === undefined ||
    right === undefined ||
    left.length !== right.length ||
    left.length === 0
  )
    return undefined;
  let dot = 0;
  let leftLength = 0;
  let rightLength = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === undefined || rightValue === undefined) return undefined;
    dot += leftValue * rightValue;
    leftLength += leftValue * leftValue;
    rightLength += rightValue * rightValue;
  }
  if (leftLength === 0 || rightLength === 0) return undefined;
  return dot / Math.sqrt(leftLength * rightLength);
}

function recommenderData(catalog: Catalog) {
  const byWork = new Map<string, Map<string, SourceRef[]>>();
  for (const evidence of catalog.recommendationEvidence) {
    if (
      !canPublishRecommendation(evidence) ||
      evidence.recommenderId === undefined
    )
      continue;
    const recommenders = byWork.get(evidence.workId) ?? new Map();
    const sources = recommenders.get(evidence.recommenderId) ?? [];
    sources.push(evidence.source);
    recommenders.set(evidence.recommenderId, sources);
    byWork.set(evidence.workId, recommenders);
  }
  return byWork;
}

function sharedRecommenderSources(
  left: Work,
  right: Work,
  data: ReturnType<typeof recommenderData>,
): SourceRef[] {
  const leftPeople = data.get(left.id) ?? new Map();
  const rightPeople = data.get(right.id) ?? new Map();
  const sources: SourceRef[] = [];
  for (const [personId, leftSources] of leftPeople) {
    const rightSources = rightPeople.get(personId);
    if (rightSources !== undefined)
      sources.push(...leftSources, ...rightSources);
  }
  return sources;
}

export function buildSimilarRelations(
  catalog: Catalog,
  hardRelations: readonly WorkRelation[],
  embeddings: ReadonlyMap<string, readonly number[]> = new Map(),
): WorkRelation[] {
  const hardPairs = new Set(
    hardRelations.map((relation) =>
      pairKey(relation.fromWorkId, relation.toWorkId),
    ),
  );
  const editorial = catalog.workRelations.filter(
    (relation) => relation.kind === "editorial",
  );
  const editorialByPair = new Map<string, WorkRelation[]>();
  for (const relation of editorial) {
    const key = pairKey(relation.fromWorkId, relation.toWorkId);
    const relations = editorialByPair.get(key) ?? [];
    relations.push(relation);
    editorialByPair.set(key, relations);
  }
  const recommenders = recommenderData(catalog);
  const candidates: WorkRelation[] = [];
  const works = [...catalog.works].toSorted((left, right) =>
    left.id.localeCompare(right.id),
  );

  for (let leftIndex = 0; leftIndex < works.length; leftIndex += 1) {
    const left = works[leftIndex];
    if (left === undefined) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < works.length;
      rightIndex += 1
    ) {
      const right = works[rightIndex];
      if (right === undefined || hardPairs.has(pairKey(left.id, right.id)))
        continue;
      const recommenderSources = sharedRecommenderSources(
        left,
        right,
        recommenders,
      );
      const editorialRelations =
        editorialByPair.get(pairKey(left.id, right.id)) ?? [];
      const embeddingSimilarity = cosine(
        embeddings.get(left.id),
        embeddings.get(right.id),
      );
      const score = scoreSimilarity({
        sharedTopicRatio: ratio(left.topicIds, right.topicIds),
        ...(embeddingSimilarity === undefined ? {} : { embeddingSimilarity }),
        sameMediaType: left.mediaType === right.mediaType,
        eraRegionRatio: eraRegionRatio(left, right),
        recommenderOverlap: recommenderSources.length > 0,
        editorial: editorialRelations.length > 0,
      });
      if (score === undefined || score.score < 0.25) continue;
      const sources = stableSources([
        ...left.sources,
        ...right.sources,
        ...recommenderSources,
        ...editorialRelations.flatMap((relation) => relation.sources),
      ]);
      for (const [from, to] of [
        [left, right],
        [right, left],
      ] as const) {
        candidates.push({
          id: createStableId("relation", from.id, to.id, "similar"),
          fromWorkId: from.id,
          toWorkId: to.id,
          kind: "similar",
          score: score.score,
          reasons: score.reasons,
          sources,
        });
      }
    }
  }

  const byWork = new Map<string, WorkRelation[]>();
  for (const relation of candidates) {
    const relations = byWork.get(relation.fromWorkId) ?? [];
    relations.push(relation);
    byWork.set(relation.fromWorkId, relations);
  }
  return [...byWork.values()]
    .flatMap((relations) =>
      relations
        .toSorted(
          (left, right) =>
            (right.score ?? 0) - (left.score ?? 0) ||
            left.toWorkId.localeCompare(right.toWorkId),
        )
        .slice(0, 6),
    )
    .toSorted(
      (left, right) =>
        left.fromWorkId.localeCompare(right.fromWorkId) ||
        left.toWorkId.localeCompare(right.toWorkId),
    );
}
