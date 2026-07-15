import { createSlug, createStableId } from "../domain/id.js";
import type {
  Edition,
  RecommendationEvidence,
  ReviewIssue,
  Work,
} from "../domain/schemas/catalog.js";
import type { EditionId, WorkId } from "../domain/schemas/primitives.js";
import {
  createEdition,
  describeEdition,
  editionsConflict,
} from "./legacy-edition.js";
import { LegacyEpisodeReferenceError } from "./legacy-error.js";
import { includePeople, type PeopleIndex } from "./legacy-people.js";
import type { LegacyEpisode, LegacyRecommendation } from "./legacy-schema.js";
import {
  appendSource,
  mapMediaType,
  officialEpisodeSource,
  splitNames,
} from "./legacy-shared.js";

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
  const identityTitle = item.original_title || item.title;
  const workId = createStableId("work", identityTitle, item.creator);
  const mediaType = mapMediaType(item.media_type);
  const creatorResult = includePeople(state.people, {
    names: splitNames(item.creator),
    role: ["documentary", "film", "television"].includes(mediaType)
      ? "director"
      : "author",
    source,
  });
  const existingWork = state.works.get(workId);
  const work: Work = existingWork
    ? {
        ...existingWork,
        sources: appendSource(existingWork.sources, source),
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
        verificationStatus: "partially_verified",
        publicationStatus: "public",
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
    verificationStatus: "partially_verified",
    publicationStatus: "public",
  };
  const creatorReviewIssues: readonly ReviewIssue[] = item.creator
    ? []
    : [
        {
          id: createStableId("issue", workId, "creatorIds"),
          entityId: workId,
          field: "creatorIds",
          reason: "旧记录没有可确认的创作者",
          candidates: [],
          source,
          status: "open",
        },
      ];
  const titleMatches =
    item.raw_entry.includes(item.title) ||
    Boolean(
      item.original_title && item.raw_entry.includes(item.original_title),
    );
  const titleIssue: readonly ReviewIssue[] = titleMatches
    ? []
    : [
        {
          id: createStableId("issue", evidenceId, "title"),
          entityId: workId,
          field: "title",
          reason: "旧记录标题无法从推荐原文中确认",
          candidates: [item.title, item.raw_entry],
          source,
          status: "open",
        },
      ];
  const workTitleIssue: readonly ReviewIssue[] =
    existingWork && existingWork.title !== item.title
      ? [
          {
            id: createStableId("issue", workId, "conflicting-title"),
            entityId: workId,
            field: "title",
            reason: "同一原名和创作者对应多个标题",
            candidates: [existingWork.title, item.title],
            source,
            status: "open",
          },
        ]
      : [];
  const editionResult = createEdition(recommenderResult.people, {
    item,
    workId,
    source,
  });
  const edition = editionResult.edition;
  const priorEdition = edition?.isbn
    ? state.editionByIsbn.get(edition.isbn)
    : undefined;
  const conflictIssue: readonly ReviewIssue[] =
    edition && priorEdition && editionsConflict(priorEdition, edition)
      ? [
          {
            id: createStableId("issue", edition.isbn ?? edition.id, "isbn"),
            entityId: workId,
            field: "isbn",
            reason: "同一 ISBN 的版本信息冲突",
            candidates: [
              describeEdition(priorEdition, editionResult.people),
              describeEdition(edition, editionResult.people),
            ],
            source,
            status: "open",
          },
        ]
      : [];
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
      ...creatorReviewIssues,
      ...titleIssue,
      ...workTitleIssue,
      ...conflictIssue,
    ],
  };
}
