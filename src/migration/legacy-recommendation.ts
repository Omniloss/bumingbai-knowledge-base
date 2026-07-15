import { createStableId } from "../domain/id.js";
import type {
  Edition,
  RecommendationEvidence,
  ReviewIssue,
  Work,
} from "../domain/schemas/catalog.js";
import type { EditionId, WorkId } from "../domain/schemas/primitives.js";
import { createEdition, integrateEdition } from "./legacy-edition.js";
import { LegacyEpisodeReferenceError } from "./legacy-error.js";
import { includePeople, type PeopleIndex } from "./legacy-people.js";
import {
  appendReviewIssues,
  createEditionConflictReviewIssue,
  createMetadataStatusReviewIssue,
  createRecommendationReviewIssues,
  createRecommendationStatusReviewIssue,
} from "./legacy-review.js";
import type { LegacyEpisode, LegacyRecommendation } from "./legacy-schema.js";
import { officialEpisodeSource, splitNames } from "./legacy-shared.js";
import {
  combineConfidence,
  decideMetadataStatus,
  decideRecommendationStatus,
} from "./legacy-status.js";
import { includeWork } from "./legacy-work.js";

export type RecommendationState = {
  readonly people: PeopleIndex;
  readonly works: ReadonlyMap<WorkId, Work>;
  readonly editions: ReadonlyMap<EditionId, Edition>;
  readonly editionByIsbn: ReadonlyMap<string, Edition>;
  readonly conflictWorkIds: ReadonlySet<WorkId>;
  readonly conflictEditionIds: ReadonlySet<EditionId>;
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
  const workResult = includeWork(
    {
      people: state.people,
      works: state.works,
      conflictWorkIds: state.conflictWorkIds,
    },
    {
      item,
      source,
      confidence: recommendationDecision.confidence,
    },
  );
  const recommenderResult = includePeople(workResult.people, {
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
    workId: workResult.workId,
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
    existingWork: workResult.existingWork,
    source,
    workId: workResult.workId,
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
    workId: workResult.workId,
    source,
    confidence: editionConfidence,
  });
  const editionIntegration = integrateEdition(
    {
      editions: state.editions,
      editionByIsbn: state.editionByIsbn,
      conflictEditionIds: state.conflictEditionIds,
    },
    editionResult.edition,
    editionConfidence,
  );
  const edition = editionIntegration.edition;
  const conflictingEdition = editionIntegration.conflictingEdition;
  const conflictIssue =
    editionResult.edition && conflictingEdition
      ? createEditionConflictReviewIssue(
          conflictingEdition,
          editionResult.edition,
          {
            people: editionResult.people,
            source,
            workId: workResult.workId,
          },
        )
      : undefined;
  const metadataStatusIssue = createMetadataStatusReviewIssue(
    metadataDecision,
    edition?.id ?? workResult.workId,
    source,
  );
  const incomingReviewIssues = [
    ...recommendationReviewIssues,
    ...(recommendationStatusIssue ? [recommendationStatusIssue] : []),
    ...(metadataStatusIssue ? [metadataStatusIssue] : []),
    ...(conflictIssue ? [conflictIssue] : []),
  ];
  return {
    people: editionResult.people,
    works: workResult.works,
    editions: editionIntegration.editions,
    editionByIsbn: editionIntegration.editionByIsbn,
    conflictWorkIds: workResult.conflictWorkIds,
    conflictEditionIds: editionIntegration.conflictEditionIds,
    recommendationEvidence: [...state.recommendationEvidence, evidence],
    reviewIssues: appendReviewIssues(state.reviewIssues, incomingReviewIssues),
  };
}
