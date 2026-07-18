import { createStableId } from "../domain/id.js";
import type { Catalog, Work, WorkRelation } from "../domain/schemas/catalog.js";
import type { SourceRef, WorkId } from "../domain/schemas/primitives.js";

type HardRelationKind = "same_creator" | "same_series" | "same_episode";

type RelationAccumulator = {
  readonly fromWorkId: WorkId;
  readonly kind: HardRelationKind;
  readonly sources: Map<string, SourceRef>;
  readonly toWorkId: WorkId;
};

const REASONS: Readonly<Record<HardRelationKind, string>> = {
  same_creator: "同一创作者",
  same_series: "同一系列",
  same_episode: "同一期节目推荐",
};

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function sourceKey(source: SourceRef): string {
  return JSON.stringify([
    source.kind,
    source.url,
    source.retrievedAt,
    source.locator ?? null,
  ]);
}

function stableSources(sources: Iterable<SourceRef>): readonly SourceRef[] {
  const uniqueSources = new Map<string, SourceRef>();
  for (const source of sources) {
    uniqueSources.set(sourceKey(source), source);
  }
  return [...uniqueSources.values()].sort((left, right) =>
    compareText(sourceKey(left), sourceKey(right)),
  );
}

function addRelation(
  relations: Map<string, RelationAccumulator>,
  fromWorkId: WorkId,
  toWorkId: WorkId,
  kind: HardRelationKind,
  sources: Iterable<SourceRef>,
): void {
  if (fromWorkId === toWorkId) {
    return;
  }

  const relationKey = `${fromWorkId}\u001f${toWorkId}\u001f${kind}`;
  let relation = relations.get(relationKey);
  if (relation === undefined) {
    relation = {
      fromWorkId,
      toWorkId,
      kind,
      sources: new Map(),
    };
    relations.set(relationKey, relation);
  }

  for (const source of sources) {
    relation.sources.set(sourceKey(source), source);
  }
}

function addBidirectionalRelation(
  relations: Map<string, RelationAccumulator>,
  leftWorkId: WorkId,
  rightWorkId: WorkId,
  kind: HardRelationKind,
  sources: Iterable<SourceRef>,
): void {
  const sourceList = [...sources];
  addRelation(relations, leftWorkId, rightWorkId, kind, sourceList);
  addRelation(relations, rightWorkId, leftWorkId, kind, sourceList);
}

function sortedWorks(works: Iterable<Work>): readonly Work[] {
  return [...works].sort((left, right) => compareText(left.id, right.id));
}

function addWorkPairs(
  relations: Map<string, RelationAccumulator>,
  works: Iterable<Work>,
  kind: "same_creator" | "same_series",
): void {
  const orderedWorks = sortedWorks(works);
  for (let leftIndex = 0; leftIndex < orderedWorks.length; leftIndex += 1) {
    const left = orderedWorks[leftIndex];
    if (left === undefined) {
      continue;
    }
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < orderedWorks.length;
      rightIndex += 1
    ) {
      const right = orderedWorks[rightIndex];
      if (right === undefined) {
        continue;
      }
      addBidirectionalRelation(relations, left.id, right.id, kind, [
        ...left.sources,
        ...right.sources,
      ]);
    }
  }
}

function addGroupedWorkRelations(
  catalog: Catalog,
  relations: Map<string, RelationAccumulator>,
): void {
  const worksByCreator = new Map<string, Work[]>();
  const worksBySeries = new Map<WorkId, Work[]>();

  for (const work of catalog.works) {
    for (const creatorId of new Set(work.creatorIds)) {
      const creatorWorks = worksByCreator.get(creatorId) ?? [];
      creatorWorks.push(work);
      worksByCreator.set(creatorId, creatorWorks);
    }
    if (work.seriesId !== undefined) {
      const seriesWorks = worksBySeries.get(work.seriesId) ?? [];
      seriesWorks.push(work);
      worksBySeries.set(work.seriesId, seriesWorks);
    }
  }

  for (const works of worksByCreator.values()) {
    addWorkPairs(relations, works, "same_creator");
  }
  for (const works of worksBySeries.values()) {
    addWorkPairs(relations, works, "same_series");
  }
}

function addEpisodeRelations(
  catalog: Catalog,
  relations: Map<string, RelationAccumulator>,
): void {
  const knownWorkIds = new Set(catalog.works.map((work) => work.id));
  const evidenceByEpisode = new Map<string, Map<WorkId, SourceRef[]>>();

  for (const evidence of catalog.recommendationEvidence) {
    if (
      evidence.publicationStatus !== "public" ||
      !knownWorkIds.has(evidence.workId)
    ) {
      continue;
    }
    const evidenceByWork =
      evidenceByEpisode.get(evidence.episodeId) ?? new Map();
    const sources = evidenceByWork.get(evidence.workId) ?? [];
    sources.push(evidence.source);
    evidenceByWork.set(evidence.workId, sources);
    evidenceByEpisode.set(evidence.episodeId, evidenceByWork);
  }

  for (const evidenceByWork of evidenceByEpisode.values()) {
    const workIds = [...evidenceByWork.keys()].sort(compareText);
    for (let leftIndex = 0; leftIndex < workIds.length; leftIndex += 1) {
      const leftWorkId = workIds[leftIndex];
      if (leftWorkId === undefined) {
        continue;
      }
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < workIds.length;
        rightIndex += 1
      ) {
        const rightWorkId = workIds[rightIndex];
        if (rightWorkId === undefined) {
          continue;
        }
        const leftSources = evidenceByWork.get(leftWorkId) ?? [];
        const rightSources = evidenceByWork.get(rightWorkId) ?? [];
        addBidirectionalRelation(
          relations,
          leftWorkId,
          rightWorkId,
          "same_episode",
          [...leftSources, ...rightSources],
        );
      }
    }
  }
}

export function buildHardRelations(catalog: Catalog): WorkRelation[] {
  const relations = new Map<string, RelationAccumulator>();

  addGroupedWorkRelations(catalog, relations);
  addEpisodeRelations(catalog, relations);

  return [...relations.values()]
    .map((relation) => ({
      id: createStableId(
        "relation",
        relation.fromWorkId,
        relation.toWorkId,
        relation.kind,
      ),
      fromWorkId: relation.fromWorkId,
      toWorkId: relation.toWorkId,
      kind: relation.kind,
      reasons: [REASONS[relation.kind]],
      sources: stableSources(relation.sources.values()),
    }))
    .sort((left, right) => {
      const fromComparison = compareText(left.fromWorkId, right.fromWorkId);
      if (fromComparison !== 0) {
        return fromComparison;
      }
      const toComparison = compareText(left.toWorkId, right.toWorkId);
      if (toComparison !== 0) {
        return toComparison;
      }
      return compareText(left.kind, right.kind);
    });
}
