import { createStableId } from "../domain/id.js";
import type { Edition, ReviewIssue, Work } from "../domain/schemas/catalog.js";
import type {
  EntityId,
  RecommendationEvidenceId,
  SourceRef,
  WorkId,
} from "../domain/schemas/primitives.js";
import { describeEdition, editionsConflict } from "./legacy-edition.js";
import { mergeSources } from "./legacy-merge.js";
import type { PeopleIndex } from "./legacy-people.js";
import type { LegacyRecommendation } from "./legacy-schema.js";
import { LEGACY_REVIEW_REASONS, type StatusDecision } from "./legacy-status.js";

type RecommendationReviewContext = {
  readonly evidenceId: RecommendationEvidenceId;
  readonly existingWork: Work | undefined;
  readonly source: SourceRef;
  readonly workId: WorkId;
};

type EditionReviewContext = {
  readonly people: PeopleIndex;
  readonly source: SourceRef;
  readonly workId: WorkId;
};

function preferredConflictSource(
  priorSources: readonly SourceRef[],
  currentSource: SourceRef,
): SourceRef {
  return mergeSources(priorSources, [currentSource])[0] ?? currentSource;
}

export function createRecommendationReviewIssues(
  item: LegacyRecommendation,
  context: RecommendationReviewContext,
): readonly ReviewIssue[] {
  const creatorIssues: readonly ReviewIssue[] = item.creator
    ? []
    : [
        {
          id: createStableId("issue", context.workId, "creatorIds"),
          entityId: context.workId,
          field: "creatorIds",
          reason: LEGACY_REVIEW_REASONS.CREATOR_MISSING,
          candidates: [],
          source: context.source,
          status: "open",
        },
      ];
  const titleMatches =
    item.raw_entry.includes(item.title) ||
    Boolean(
      item.original_title && item.raw_entry.includes(item.original_title),
    );
  const titleIssues: readonly ReviewIssue[] = titleMatches
    ? []
    : [
        {
          id: createStableId("issue", context.evidenceId, "title"),
          entityId: context.workId,
          field: "title",
          reason: LEGACY_REVIEW_REASONS.TITLE_UNCONFIRMED,
          candidates: [item.title, item.raw_entry],
          source: context.source,
          status: "open",
        },
      ];
  const conflictIssues: readonly ReviewIssue[] =
    context.existingWork && context.existingWork.title !== item.title
      ? [
          {
            id: createStableId("issue", context.workId, "conflicting-title"),
            entityId: context.workId,
            field: "title",
            reason: LEGACY_REVIEW_REASONS.TITLE_CONFLICT,
            candidates: [context.existingWork.title, item.title].toSorted(),
            source: preferredConflictSource(
              context.existingWork.sources,
              context.source,
            ),
            status: "open",
          },
        ]
      : [];
  return [...creatorIssues, ...titleIssues, ...conflictIssues];
}

export function createRecommendationStatusReviewIssue(
  decision: StatusDecision,
  evidenceId: RecommendationEvidenceId,
  source: SourceRef,
): ReviewIssue | undefined {
  if (!decision.review) return undefined;
  return {
    id: createStableId("issue", evidenceId, "recommendationStatus"),
    entityId: evidenceId,
    field: "recommendationStatus",
    reason: decision.review.reason,
    candidates: decision.review.candidates,
    source,
    status: "open",
  };
}

export function createMetadataStatusReviewIssue(
  decision: StatusDecision,
  entityId: EntityId,
  source: SourceRef,
): ReviewIssue | undefined {
  if (!decision.review) return undefined;
  return {
    id: createStableId("issue", entityId, "metadataStatus"),
    entityId,
    field: "metadataStatus",
    reason: decision.review.reason,
    candidates: decision.review.candidates,
    source,
    status: "open",
  };
}

export function createEditionConflictReviewIssue(
  previous: Edition,
  current: Edition,
  context: EditionReviewContext,
): ReviewIssue | undefined {
  if (!editionsConflict(previous, current)) return undefined;
  return {
    id: createStableId("issue", current.isbn ?? current.id, "isbn"),
    entityId: context.workId,
    field: "isbn",
    reason: LEGACY_REVIEW_REASONS.EDITION_CONFLICT,
    candidates: [
      describeEdition(previous, context.people),
      describeEdition(current, context.people),
    ].toSorted(),
    source: preferredConflictSource(previous.sources, context.source),
    status: "open",
  };
}

export function appendReviewIssues(
  existing: readonly ReviewIssue[],
  incoming: readonly ReviewIssue[],
): readonly ReviewIssue[] {
  const uniqueIncoming = incoming.filter(
    (issue, index, issues) =>
      !existing.some((candidate) => candidate.id === issue.id) &&
      issues.findIndex((candidate) => candidate.id === issue.id) === index,
  );
  return [...existing, ...uniqueIncoming];
}
