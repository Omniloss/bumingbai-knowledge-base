import { expect } from "vitest";
import type { Catalog } from "../../src/domain/schemas/catalog.js";
import { migrateLegacy } from "../../src/migration/legacy.js";

const RETRIEVED_AT = "2026-07-14T00:00:00.000Z";
export const FETCHED = "已抓取推荐链接元数据";
export const RAW_ONLY = "仅保留节目原文，待人工书目核验";

export type Candidate = {
  readonly episode: object;
  readonly recommendation: object;
};

export type CandidateFixture = {
  readonly number: number;
  readonly title: string;
  readonly officialRecommendation: boolean;
  readonly metadataStatus: string;
  readonly originalTitle?: string;
  readonly creator?: string;
  readonly mediaType?: string;
  readonly edition?: {
    readonly translator: string;
    readonly publicationYear: string;
    readonly publisher?: string;
    readonly isbn?: string;
  };
};

export function candidate(fixture: CandidateFixture): Candidate {
  const translator = fixture.edition?.translator ?? "";
  const creator = fixture.creator ?? "测试作者";
  return {
    episode: {
      episode_number: fixture.number,
      title: `结合性测试节目 ${fixture.number}`,
      published_at: "Fri, 17 Jun 2022 09:00:00 GMT",
      official_url: `https://bumingbai.net/episodes/associative-${fixture.number}`,
      recommendation_status: fixture.officialRecommendation
        ? "官方简介明确标注"
        : "官方简介未出现推荐标记",
    },
    recommendation: {
      episode_number: fixture.number,
      recommendation_order: 1,
      raw_entry: `《${fixture.title}》 ${creator} 著`,
      title: fixture.title,
      original_title: fixture.originalTitle ?? "Associative Merge Identity",
      creator,
      media_type: fixture.mediaType ?? "书籍/文本",
      translator,
      publisher: translator
        ? (fixture.edition?.publisher ?? "结合性测试出版社")
        : "",
      publication_year: fixture.edition?.publicationYear ?? "",
      isbn: translator ? (fixture.edition?.isbn ?? "9780000000026") : "",
      metadata_status: fixture.metadataStatus,
    },
  };
}

export function workCandidate(
  number: number,
  title: string,
  officialRecommendation: boolean,
): Candidate {
  return candidate({
    number,
    title,
    officialRecommendation,
    metadataStatus: FETCHED,
  });
}

export function editionCandidate(
  number: number,
  title: string,
  edition: {
    readonly metadataStatus: string;
    readonly translator: string;
    readonly publicationYear: string;
  },
): Candidate {
  return candidate({
    number,
    title,
    officialRecommendation: true,
    metadataStatus: edition.metadataStatus,
    edition,
  });
}

function permutations<T>(
  values: readonly [T, T, T],
): readonly (readonly T[])[] {
  const [first, second, third] = values;
  return [
    [first, second, third],
    [first, third, second],
    [second, first, third],
    [second, third, first],
    [third, first, second],
    [third, second, first],
  ];
}

export function migrate(records: readonly Candidate[]): Catalog {
  return migrateLegacy(
    {
      retrieved_at: RETRIEVED_AT,
      episodes: records.map((record) => record.episode),
      recommendations: records.map((record) => record.recommendation),
    },
    RETRIEVED_AT,
  );
}

function issueView(catalog: Catalog, field: "title" | "isbn"): object {
  return catalog.reviewIssues
    .filter((issue) => issue.field === field)
    .map((issue) => ({
      candidates: issue.candidates,
      reason: issue.reason,
      source: issue.source,
    }))
    .toSorted((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
}

export function workView(catalog: Catalog): object {
  const work = catalog.works[0];
  return {
    title: work?.title,
    verificationStatus: work?.verificationStatus,
    publicationStatus: work?.publicationStatus,
    sources: work?.sources ?? [],
    reviewIssues: issueView(catalog, "title"),
  };
}

export function editionView(catalog: Catalog): object {
  const edition = catalog.editions[0];
  return {
    title: edition?.title,
    translatorNames:
      edition?.translatorIds
        .map((id) => catalog.people.find((person) => person.id === id)?.name)
        .toSorted() ?? [],
    publishedAt: edition?.publishedAt,
    verificationStatus: edition?.verificationStatus,
    publicationStatus: edition?.publicationStatus,
    sources: edition?.sources ?? [],
    reviewIssues: issueView(catalog, "isbn"),
  };
}

export function expectEveryPermutationEqual(
  records: readonly [Candidate, Candidate, Candidate],
  view: (catalog: Catalog) => object,
): readonly object[] {
  const results = permutations(records).map((items) => view(migrate(items)));
  const expected = results.at(0);
  for (const result of results.slice(1)) expect(result).toEqual(expected);
  return results;
}
