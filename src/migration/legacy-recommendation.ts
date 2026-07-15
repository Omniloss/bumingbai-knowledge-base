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
import type { MergeCandidate } from "./legacy-merge.js";
import { includePeople, type PeopleIndex } from "./legacy-people.js";
import {
  appendReviewIssues,
  createEditionConflictReviewIssue,
  createMetadataStatusReviewIssue,
  createRecommendationReviewIssues,
  createRecommendationStatusReviewIssue,
  createWorkConflictReviewIssue,
  editionConflictReviewIssueId,
  replaceReviewIssue,
  workConflictReviewIssueId,
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
  readonly workCandidates: ReadonlyMap<WorkId, readonly MergeCandidate<Work>[]>;
  readonly editions: ReadonlyMap<EditionId, Edition>;
  readonly editionCandidates: ReadonlyMap<
    EditionId,
    readonly MergeCandidate<Edition>[]
  >;
  readonly editionCandidatesByIsbn: ReadonlyMap<
    string,
    readonly MergeCandidate<Edition>[]
  >;
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
      workCandidates: state.workCandidates,
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
    source,
    workId: workResult.workId,
  });
  const workConflictIssue = createWorkConflictReviewIssue(
    workResult.conflictingWorks,
    { people: workResult.people, source, workId: workResult.workId },
  );
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
      editionCandidates: state.editionCandidates,
      editionCandidatesByIsbn: state.editionCandidatesByIsbn,
    },
    editionResult.edition,
    editionConfidence,
  );
  const edition = editionIntegration.edition;
  const editionIdentity = edition?.isbn ?? edition?.id;
  const editionConflictIssue =
    editionIdentity && editionIntegration.conflictingEditions.length > 0
      ? createEditionConflictReviewIssue(
          editionIntegration.conflictingEditions,
          editionIdentity,
          {
            people: editionResult.people,
            source,
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
  ];
  const stableReviewIssues = appendReviewIssues(
    state.reviewIssues,
    incomingReviewIssues,
  );
  const workReviewIssues = replaceReviewIssue(
    stableReviewIssues,
    workConflictReviewIssueId(workResult.workId),
    workConflictIssue,
  );
  const reviewIssues = editionIdentity
    ? replaceReviewIssue(
        workReviewIssues,
        editionConflictReviewIssueId(editionIdentity),
        editionConflictIssue,
      )
    : workReviewIssues;
  return {
    people: editionResult.people,
    works: workResult.works,
    workCandidates: workResult.workCandidates,
    editions: editionIntegration.editions,
    editionCandidates: editionIntegration.editionCandidates,
    editionCandidatesByIsbn: editionIntegration.editionCandidatesByIsbn,
    recommendationEvidence: [...state.recommendationEvidence, evidence],
    reviewIssues,
  };
}
