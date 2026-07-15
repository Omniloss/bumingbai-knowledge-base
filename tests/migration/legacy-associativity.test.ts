import { describe, expect, it } from "vitest";
import type { Catalog } from "../../src/domain/schemas/catalog.js";
import { migrateLegacy } from "../../src/migration/legacy.js";

const RETRIEVED_AT = "2026-07-14T00:00:00.000Z";
const FETCHED = "已抓取推荐链接元数据";
const RAW_ONLY = "仅保留节目原文，待人工书目核验";

type Candidate = {
  readonly episode: object;
  readonly recommendation: object;
};

type CandidateFixture = {
  readonly number: number;
  readonly title: string;
  readonly officialRecommendation: boolean;
  readonly metadataStatus: string;
  readonly edition?: {
    readonly translator: string;
    readonly publicationYear: string;
  };
};

function candidate(fixture: CandidateFixture): Candidate {
  const translator = fixture.edition?.translator ?? "";
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
      raw_entry: `《${fixture.title}》 测试作者 著`,
      title: fixture.title,
      original_title: "Associative Merge Identity",
      creator: "测试作者",
      media_type: "书籍/文本",
      translator,
      publisher: translator ? "结合性测试出版社" : "",
      publication_year: fixture.edition?.publicationYear ?? "",
      isbn: translator ? "9780000000026" : "",
      metadata_status: fixture.metadataStatus,
    },
  };
}

function workCandidate(
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

function editionCandidate(
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

function migrate(records: readonly Candidate[]): Catalog {
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

function workView(catalog: Catalog): object {
  const work = catalog.works[0];
  return {
    title: work?.title,
    verificationStatus: work?.verificationStatus,
    publicationStatus: work?.publicationStatus,
    sources: work?.sources ?? [],
    reviewIssues: issueView(catalog, "title"),
  };
}

function editionView(catalog: Catalog): object {
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

function expectEveryPermutationEqual(
  records: readonly [Candidate, Candidate, Candidate],
  view: (catalog: Catalog) => object,
): readonly object[] {
  const results = permutations(records).map((items) => view(migrate(items)));
  const expected = results.at(0);
  for (const result of results.slice(1)) expect(result).toEqual(expected);
  return results;
}

describe("legacy entity merge associativity", () => {
  it("lets the strongest Work candidate win after two weaker candidates conflict", () => {
    // Given
    const records = [
      workCandidate(11, "低可信标题甲", false),
      workCandidate(12, "低可信标题乙", false),
      workCandidate(13, "最高可信标题", true),
    ] as const;

    // When
    const results = expectEveryPermutationEqual(records, workView);

    // Then
    expect(results.at(0)).toMatchObject({
      title: "最高可信标题",
      verificationStatus: "partially_verified",
      publicationStatus: "public",
      reviewIssues: [],
    });
  });

  it("withholds a Work conflict from all equal-confidence candidates", () => {
    // Given
    const records = [
      workCandidate(21, "同级标题甲", true),
      workCandidate(22, "同级标题乙", true),
      workCandidate(23, "同级标题丙", true),
    ] as const;

    // When
    const results = expectEveryPermutationEqual(records, workView);

    // Then
    expect(results.at(0)).toMatchObject({
      verificationStatus: "pending_verification",
      publicationStatus: "withheld",
      reviewIssues: [
        {
          candidates: ["同级标题丙", "同级标题乙", "同级标题甲"],
          source: {
            url: "https://bumingbai.net/episodes/associative-21",
          },
        },
      ],
    });
  });

  it("lets the strongest Edition candidate win after two weaker candidates conflict", () => {
    // Given
    const records = [
      editionCandidate(31, "结合性版本", {
        metadataStatus: RAW_ONLY,
        translator: "低可信译者甲",
        publicationYear: "2001",
      }),
      editionCandidate(32, "结合性版本", {
        metadataStatus: RAW_ONLY,
        translator: "低可信译者乙",
        publicationYear: "2002",
      }),
      editionCandidate(33, "结合性版本", {
        metadataStatus: FETCHED,
        translator: "最高可信译者",
        publicationYear: "2026",
      }),
    ] as const;

    // When
    const results = expectEveryPermutationEqual(records, editionView);

    // Then
    expect(results.at(0)).toMatchObject({
      translatorNames: ["最高可信译者"],
      publishedAt: "2026",
      verificationStatus: "partially_verified",
      publicationStatus: "public",
      reviewIssues: [],
    });
  });

  it("withholds an Edition conflict from all equal-confidence candidates", () => {
    // Given
    const records = [
      editionCandidate(41, "同级版本", {
        metadataStatus: FETCHED,
        translator: "同级译者甲",
        publicationYear: "2021",
      }),
      editionCandidate(42, "同级版本", {
        metadataStatus: FETCHED,
        translator: "同级译者乙",
        publicationYear: "2022",
      }),
      editionCandidate(43, "同级版本", {
        metadataStatus: FETCHED,
        translator: "同级译者丙",
        publicationYear: "2023",
      }),
    ] as const;

    // When
    const results = expectEveryPermutationEqual(records, editionView);

    // Then
    expect(results.at(0)).toMatchObject({
      verificationStatus: "pending_verification",
      publicationStatus: "withheld",
      reviewIssues: [
        {
          candidates: [
            "9780000000026 | 结合性测试出版社 | 同级译者丙 | 2023",
            "9780000000026 | 结合性测试出版社 | 同级译者乙 | 2022",
            "9780000000026 | 结合性测试出版社 | 同级译者甲 | 2021",
          ],
          source: {
            url: "https://bumingbai.net/episodes/associative-41",
          },
        },
      ],
    });
  });
});
