import { createSlug, createStableId } from "../domain/id.js";
import type {
  Edition,
  RecommendationEvidence,
  ReviewIssue,
  Work,
} from "../domain/schemas/catalog.js";
import type { EditionId, WorkId } from "../domain/schemas/primitives.js";
import { createEdition } from "./legacy-edition.js";
import { LegacyEpisodeReferenceError } from "./legacy-error.js";
import { includePeople, type PeopleIndex } from "./legacy-people.js";
import {
  createEditionConflictReviewIssue,
  createMetadataStatusReviewIssue,
  createRecommendationReviewIssues,
  createRecommendationStatusReviewIssue,
} from "./legacy-review.js";
import type { LegacyEpisode, LegacyRecommendation } from "./legacy-schema.js";
import {
  appendSource,
  mapMediaType,
  officialEpisodeSource,
  splitNames,
} from "./legacy-shared.js";
import {
  combineConfidence,
  confidenceFromPublicationStatus,
  decideMetadataStatus,
  decideRecommendationStatus,
  strongestConfidence,
} from "./legacy-status.js";

export type RecommendationState = {
  readonly people: PeopleIndex;
  readonly works: ReadonlyMap<WorkId, Work>;
  readonly editions: ReadonlyMap<EditionId, Edition>;
  readonly editionByIsbn: ReadonlyMap<string, Edition>;
  readonly recommendationEvidence: readonly RecommendationEvidence[];
  readonly reviewIssues: readonly ReviewIssue[];
};

type RecommendationContext = {
  readonly episodeByNumber: ReadonlyMap<number, LegacyEpisode>;
  readonly retrievedAt: string;
};

export function migrateRecommendation(
  state: RecommendationState,
  item: LegacyRecommendation,
  context: RecommendationContext,
): RecommendationState {
  const episode = context.episodeByNumber.get(item.episode_number);
  if (!episode) throw new LegacyEpisodeReferenceError(item.episode_number);

  const source = officialEpisodeSource(
    episode.official_url,
    context.retrievedAt,
    `recommendation-${item.recommendation_order}`,
  );
  const recommendationDecision = decideRecommendationStatus(
    episode.recommendation_status,
  );
  const metadataDecision = decideMetadataStatus(item.metadata_status);
  const identityTitle = item.original_title || item.title;
  const workId = createStableId("work", identityTitle, item.creator);
  const mediaType = mapMediaType(item.media_type);
  const creatorResult = includePeople(state.people, {
    names: splitNames(item.creator),
    role: ["documentary", "film", "television"].includes(mediaType)
      ? "director"
      : "author",
    source,
    confidence: recommendationDecision.confidence,
  });
  const existingWork = state.works.get(workId);
  const workConfidence = existingWork
    ? strongestConfidence(
        confidenceFromPublicationStatus(existingWork.publicationStatus),
        recommendationDecision.confidence,
      )
    : recommendationDecision.confidence;
  const work: Work = existingWork
    ? {
        ...existingWork,
        sources: appendSource(existingWork.sources, source),
        verificationStatus: workConfidence.verificationStatus,
        publicationStatus: workConfidence.publicationStatus,
      }
    : {
        id: workId,
        slug: `${createSlug(item.title)}-${workId.slice(-6)}`,
        title: item.title,
        ...(item.original_title ? { originalTitle: item.original_title } : {}),
        mediaType,
        creatorIds: creatorResult.ids,
        topicIds: [],
        genres: [],
        regions: [],
        verificationStatus: workConfidence.verificationStatus,
        publicationStatus: workConfidence.publicationStatus,
        sources: [source],
      };
  const works: ReadonlyMap<WorkId, Work> = new Map([
    ...state.works,
    [workId, work] as const,
  ]);
  const recommenderResult = includePeople(creatorResult.people, {
    names: splitNames(item.recommender),
    role: "guest",
    source,
    confidence: recommendationDecision.confidence,
  });
  const evidenceId = createStableId(
    "evidence",
    String(item.episode_number),
    String(item.recommendation_order),
    item.raw_entry,
  );
  const evidence: RecommendationEvidence = {
    id: evidenceId,
    episodeId: createStableId("episode", String(item.episode_number)),
    workId,
    ...(recommenderResult.ids[0]
      ? { recommenderId: recommenderResult.ids[0] }
      : {}),
    rawText: item.raw_entry,
    source,
    verificationStatus: recommendationDecision.confidence.verificationStatus,
    publicationStatus: recommendationDecision.confidence.publicationStatus,
  };
  const recommendationReviewIssues = createRecommendationReviewIssues(item, {
    evidenceId,
    existingWork,
    source,
    workId,
  });
  const recommendationStatusIssue = createRecommendationStatusReviewIssue(
    recommendationDecision,
    evidenceId,
    source,
  );
  const editionConfidence = combineConfidence(
    recommendationDecision.confidence,
    metadataDecision.confidence,
  );
  const editionResult = createEdition(recommenderResult.people, {
    item,
    workId,
    source,
    confidence: editionConfidence,
  });
  const createdEdition = editionResult.edition;
  const existingEdition = createdEdition
    ? state.editions.get(createdEdition.id)
    : undefined;
  const mergedEditionConfidence = existingEdition
    ? strongestConfidence(
        confidenceFromPublicationStatus(existingEdition.publicationStatus),
        editionConfidence,
      )
    : editionConfidence;
  const edition = createdEdition
    ? {
        ...createdEdition,
        verificationStatus: mergedEditionConfidence.verificationStatus,
        publicationStatus: mergedEditionConfidence.publicationStatus,
        sources: existingEdition
          ? existingEdition.sources.reduce(
              (sources, previousSource) =>
                appendSource(sources, previousSource),
              createdEdition.sources,
            )
          : createdEdition.sources,
      }
    : undefined;
  const priorEdition = edition?.isbn
    ? state.editionByIsbn.get(edition.isbn)
    : undefined;
  const conflictIssue =
    edition && priorEdition
      ? createEditionConflictReviewIssue(priorEdition, edition, {
          people: editionResult.people,
          source,
          workId,
        })
      : undefined;
  const metadataStatusIssue = createMetadataStatusReviewIssue(
    metadataDecision,
    edition?.id ?? workId,
    source,
  );
  const editions: ReadonlyMap<EditionId, Edition> = edition
    ? new Map([...state.editions, [edition.id, edition] as const])
    : state.editions;
  const editionByIsbn: ReadonlyMap<string, Edition> =
    edition?.isbn && !priorEdition
      ? new Map([...state.editionByIsbn, [edition.isbn, edition] as const])
      : state.editionByIsbn;
  return {
    people: editionResult.people,
    works,
    editions,
    editionByIsbn,
    recommendationEvidence: [...state.recommendationEvidence, evidence],
    reviewIssues: [
      ...state.reviewIssues,
      ...recommendationReviewIssues,
      ...(recommendationStatusIssue ? [recommendationStatusIssue] : []),
      ...(metadataStatusIssue ? [metadataStatusIssue] : []),
      ...(conflictIssue ? [conflictIssue] : []),
    ],
  };
}
