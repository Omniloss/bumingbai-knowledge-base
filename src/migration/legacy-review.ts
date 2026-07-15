import { createStableId } from "../domain/id.js";
import type { Edition, ReviewIssue, Work } from "../domain/schemas/catalog.js";
import type {
  EntityId,
  RecommendationEvidenceId,
  ReviewIssueId,
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
  readonly source: SourceRef;
  readonly workId: WorkId;
};

type EditionReviewContext = {
  readonly people: PeopleIndex;
  readonly source: SourceRef;
};

function preferredConflictSource(
  candidateSources: readonly SourceRef[],
  fallback: SourceRef,
): SourceRef {
  return mergeSources([], candidateSources)[0] ?? fallback;
}

export function workConflictReviewIssueId(workId: WorkId): ReviewIssueId {
  return createStableId("issue", workId, "conflicting-title");
}

export function editionConflictReviewIssueId(identity: string): ReviewIssueId {
  return createStableId("issue", identity, "isbn");
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
  return [...creatorIssues, ...titleIssues];
}

export function createWorkConflictReviewIssue(
  candidates: readonly Work[],
  context: Pick<RecommendationReviewContext, "source" | "workId"> & {
    readonly people: PeopleIndex;
  },
): ReviewIssue | undefined {
  const descriptions = candidates
    .map((candidate) => describeWork(candidate, context.people))
    .filter((value, index, values) => values.indexOf(value) === index)
    .toSorted();
  if (descriptions.length < 2) return undefined;
  return {
    id: workConflictReviewIssueId(context.workId),
    entityId: context.workId,
    field: "title",
    reason: LEGACY_REVIEW_REASONS.TITLE_CONFLICT,
    candidates: descriptions,
    source: preferredConflictSource(
      candidates.flatMap((candidate) => candidate.sources),
      context.source,
    ),
    status: "open",
  };
}

function describeWork(work: Work, people: PeopleIndex): string {
  const creatorNames = work.creatorIds
    .map((id) => people.get(id)?.name)
    .filter((name): name is string => name !== undefined)
    .join("、");
  return [
    `标题=${work.title}`,
    `原名=${work.originalTitle ?? "无"}`,
    `媒体类型=${work.mediaType}`,
    `创作者=${creatorNames || "未知"}`,
    `年份=${work.year ?? "未知"}`,
    `主题=${work.topicIds.join("、") || "无"}`,
    `体裁=${work.genres.join("、") || "无"}`,
    `地区=${work.regions.join("、") || "无"}`,
    `系列=${work.seriesId ?? "无"}`,
  ].join(" | ");
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
  candidates: readonly Edition[],
  identity: string,
  context: EditionReviewContext,
): ReviewIssue | undefined {
  const conflictingCandidates = candidates.filter((candidate, index) =>
    candidates.some(
      (other, otherIndex) =>
        index !== otherIndex && editionsConflict(candidate, other),
    ),
  );
  const descriptions = conflictingCandidates
    .map((candidate) => describeEdition(candidate, context.people))
    .filter((value, index, values) => values.indexOf(value) === index)
    .toSorted();
  if (descriptions.length < 2) return undefined;
  const entityId = conflictingCandidates.reduce((selected, candidate) =>
    candidate.id < selected.id ? candidate : selected,
  ).id;
  return {
    id: editionConflictReviewIssueId(identity),
    entityId,
    field: "isbn",
    reason: LEGACY_REVIEW_REASONS.EDITION_CONFLICT,
    candidates: descriptions,
    source: preferredConflictSource(
      conflictingCandidates.flatMap((candidate) => candidate.sources),
      context.source,
    ),
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

export function replaceReviewIssue(
  existing: readonly ReviewIssue[],
  id: ReviewIssueId,
  replacement: ReviewIssue | undefined,
): readonly ReviewIssue[] {
  const retained = existing.filter((issue) => issue.id !== id);
  return replacement ? appendReviewIssues(retained, [replacement]) : retained;
}
