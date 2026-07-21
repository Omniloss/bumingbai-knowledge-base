import { createSlug, createStableId } from "../domain/id.js";
import type { Work } from "../domain/schemas/catalog.js";
import type { SourceRef, WorkId } from "../domain/schemas/primitives.js";
import { type MergeCandidate, resolveCandidates } from "./legacy-merge.js";
import { includePeople, type PeopleIndex } from "./legacy-people.js";
import type { LegacyRecommendation } from "./legacy-schema.js";
import { mapMediaType, splitNames } from "./legacy-shared.js";
import type { MigrationConfidence } from "./legacy-status.js";

type WorkRequest = {
  readonly item: LegacyRecommendation;
  readonly source: SourceRef;
  readonly confidence: MigrationConfidence;
};

type WorkIndex = {
  readonly people: PeopleIndex;
  readonly works: ReadonlyMap<WorkId, Work>;
  readonly workCandidates: ReadonlyMap<WorkId, readonly MergeCandidate<Work>[]>;
};

type WorkResult = WorkIndex & {
  readonly workId: WorkId;
  readonly conflictingWorks: readonly Work[];
};

function workPayloadKey(work: Work): string {
  return [
    work.title,
    work.originalTitle ?? "",
    work.mediaType,
    work.creatorIds.join("\u001f"),
    String(work.year ?? ""),
    work.topicIds.join("\u001f"),
    work.genres.join("\u001f"),
    work.regions.join("\u001f"),
    work.seriesId ?? "",
  ].join("\u001e");
}

export function includeWork(
  index: WorkIndex,
  request: WorkRequest,
): WorkResult {
  const { item, source } = request;
  const identityTitle = item.original_title || item.title;
  const workId = createStableId("work", identityTitle, item.creator);
  const mediaType = mapMediaType(item.media_type);
  const creatorResult = includePeople(index.people, {
    names: splitNames(item.creator),
    role: ["documentary", "film", "television"].includes(mediaType)
      ? "director"
      : "author",
    source,
    confidence: request.confidence,
  });
  const candidate: Work = {
    id: workId,
    slug: `${createSlug(item.title)}-${workId.slice(-6)}`,
    title: item.title,
    ...(item.original_title ? { originalTitle: item.original_title } : {}),
    mediaType,
    creatorIds: creatorResult.ids,
    topicIds: [],
    genres: [],
    regions: [],
    verificationStatus: request.confidence.verificationStatus,
    publicationStatus: request.confidence.publicationStatus,
    sources: [source],
  };
  const resolution = resolveCandidates(
    index.workCandidates.get(workId) ?? [],
    { entity: candidate, confidence: request.confidence },
    workPayloadKey,
  );
  const work: Work = {
    ...resolution.selected,
    verificationStatus: resolution.confidence.verificationStatus,
    publicationStatus: resolution.confidence.publicationStatus,
    sources: resolution.sources,
  };
  return {
    people: creatorResult.people,
    works: new Map([...index.works, [workId, work] as const]),
    workCandidates: new Map([
      ...index.workCandidates,
      [workId, resolution.candidates] as const,
    ]),
    workId,
    conflictingWorks: resolution.conflict ? resolution.highestCandidates : [],
  };
}
