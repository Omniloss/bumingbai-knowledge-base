import { createSlug, createStableId } from "../domain/id.js";
import type { Work } from "../domain/schemas/catalog.js";
import type { SourceRef, WorkId } from "../domain/schemas/primitives.js";
import {
  compareConfidence,
  mergeSources,
  selectCanonical,
} from "./legacy-merge.js";
import { includePeople, type PeopleIndex } from "./legacy-people.js";
import type { LegacyRecommendation } from "./legacy-schema.js";
import { mapMediaType, splitNames } from "./legacy-shared.js";
import {
  confidenceFromPublicationStatus,
  type MigrationConfidence,
  WITHHELD_CONFIDENCE,
} from "./legacy-status.js";

type WorkRequest = {
  readonly item: LegacyRecommendation;
  readonly source: SourceRef;
  readonly confidence: MigrationConfidence;
};

type WorkIndex = {
  readonly people: PeopleIndex;
  readonly works: ReadonlyMap<WorkId, Work>;
  readonly conflictWorkIds: ReadonlySet<WorkId>;
};

type WorkResult = WorkIndex & {
  readonly workId: WorkId;
  readonly existingWork: Work | undefined;
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

function mergeWork(
  existing: Work,
  candidate: Work,
  candidateConfidence: MigrationConfidence,
  hasConflict: boolean,
): { readonly work: Work; readonly conflict: boolean } {
  const existingConfidence = confidenceFromPublicationStatus(
    existing.publicationStatus,
  );
  const order = compareConfidence(existingConfidence, candidateConfidence);
  const payloadConflict =
    workPayloadKey(existing) !== workPayloadKey(candidate);
  const conflict = hasConflict || (order === "equal" && payloadConflict);
  const selected =
    conflict || order === "equal"
      ? selectCanonical(existing, candidate, workPayloadKey)
      : order === "left"
        ? existing
        : candidate;
  const confidence = conflict
    ? WITHHELD_CONFIDENCE
    : order === "left"
      ? existingConfidence
      : candidateConfidence;
  return {
    work: {
      ...selected,
      verificationStatus: confidence.verificationStatus,
      publicationStatus: confidence.publicationStatus,
      sources: mergeSources(existing.sources, candidate.sources),
    },
    conflict,
  };
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
  const existingWork = index.works.get(workId);
  const mergeResult = existingWork
    ? mergeWork(
        existingWork,
        candidate,
        request.confidence,
        index.conflictWorkIds.has(workId),
      )
    : { work: candidate, conflict: false };
  return {
    people: creatorResult.people,
    works: new Map([...index.works, [workId, mergeResult.work] as const]),
    workId,
    existingWork,
    conflictWorkIds: mergeResult.conflict
      ? new Set([...index.conflictWorkIds, workId])
      : index.conflictWorkIds,
  };
}
