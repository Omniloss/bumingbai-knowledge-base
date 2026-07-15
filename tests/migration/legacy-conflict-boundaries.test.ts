import { describe, expect, it } from "vitest";
import { createStableId } from "../../src/domain/id.js";
import type { Catalog } from "../../src/domain/schemas/catalog.js";
import {
  candidate,
  expectEveryPermutationEqual,
  FETCHED,
  migrate,
  RAW_ONLY,
  workView,
} from "./legacy-associativity-fixture.js";

function isbnConflictView(catalog: Catalog): object {
  return {
    editions: catalog.editions
      .map((edition) => ({
        workId: edition.workId,
        title: edition.title,
        verificationStatus: edition.verificationStatus,
        publicationStatus: edition.publicationStatus,
        sources: edition.sources,
      }))
      .toSorted((left, right) => left.workId.localeCompare(right.workId)),
    reviewIssues: catalog.reviewIssues
      .filter((issue) => issue.field === "isbn")
      .map((issue) => ({ candidates: issue.candidates, source: issue.source })),
  };
}

const SHARED_EDITION = {
  translator: "共享译者",
  publicationYear: "2024",
  publisher: "共享出版社",
  isbn: "9780000000033",
} as const;

describe("legacy conflict review boundaries", () => {
  it("describes every conflicting Work payload field deterministically", () => {
    // Given
    const records = [
      candidate({
        number: 51,
        title: "同名作品",
        originalTitle: "Same Work Identity",
        creator: "同一创作者",
        mediaType: "书籍/文本",
        officialRecommendation: true,
        metadataStatus: FETCHED,
      }),
      candidate({
        number: 52,
        title: "同名作品",
        originalTitle: "Same Work Identity",
        creator: "同一创作者",
        mediaType: "电影",
        officialRecommendation: true,
        metadataStatus: FETCHED,
      }),
      candidate({
        number: 53,
        title: "同名作品",
        originalTitle: "Same Work Identity",
        creator: "同一创作者",
        mediaType: "书籍/文本",
        officialRecommendation: true,
        metadataStatus: FETCHED,
      }),
    ] as const;

    // When
    const results = expectEveryPermutationEqual(records, workView);

    // Then
    expect(results.at(0)).toMatchObject({
      verificationStatus: "pending_verification",
      publicationStatus: "withheld",
      reviewIssues: [{ candidates: expect.any(Array) }],
    });
    const descriptions = JSON.stringify(results.at(0));
    expect(descriptions).toContain("同名作品");
    expect(descriptions).toContain("Same Work Identity");
    expect(descriptions).toContain("同一创作者");
    expect(descriptions).toContain("book");
    expect(descriptions).toContain("film");
  });

  it("withholds every highest-confidence Edition in a cross-Work ISBN conflict", () => {
    // Given
    const records = [
      candidate({
        number: 61,
        title: "共享版本标题",
        originalTitle: "ISBN Work Alpha",
        officialRecommendation: true,
        metadataStatus: FETCHED,
        edition: SHARED_EDITION,
      }),
      candidate({
        number: 62,
        title: "共享版本标题",
        originalTitle: "ISBN Work Beta",
        officialRecommendation: true,
        metadataStatus: FETCHED,
        edition: SHARED_EDITION,
      }),
      candidate({
        number: 63,
        title: "共享版本标题",
        originalTitle: "ISBN Work Alpha",
        officialRecommendation: true,
        metadataStatus: FETCHED,
        edition: SHARED_EDITION,
      }),
    ] as const;
    const workIds = [
      createStableId("work", "ISBN Work Alpha", "测试作者"),
      createStableId("work", "ISBN Work Beta", "测试作者"),
    ];

    // When
    const results = expectEveryPermutationEqual(records, isbnConflictView);
    const result = results.at(0);

    // Then
    expect(result).toMatchObject({
      editions: [
        { publicationStatus: "withheld" },
        { publicationStatus: "withheld" },
      ],
      reviewIssues: [{ candidates: expect.any(Array) }],
    });
    const description = JSON.stringify(result);
    expect(description).toContain(workIds[0]);
    expect(description).toContain(workIds[1]);
    expect(description).toContain("共享版本标题");
  });

  it("keeps one stronger ISBN candidate public after weaker conflicts", () => {
    // Given
    const records = [
      candidate({
        number: 71,
        title: "弱版本甲",
        originalTitle: "Weak ISBN Work Alpha",
        officialRecommendation: true,
        metadataStatus: RAW_ONLY,
        edition: SHARED_EDITION,
      }),
      candidate({
        number: 72,
        title: "弱版本乙",
        originalTitle: "Weak ISBN Work Beta",
        officialRecommendation: true,
        metadataStatus: RAW_ONLY,
        edition: SHARED_EDITION,
      }),
      candidate({
        number: 73,
        title: "强版本",
        originalTitle: "Strong ISBN Work",
        officialRecommendation: true,
        metadataStatus: FETCHED,
        edition: SHARED_EDITION,
      }),
    ] as const;
    const strongWorkId = createStableId("work", "Strong ISBN Work", "测试作者");

    // When
    const results = expectEveryPermutationEqual(records, isbnConflictView);
    const catalog = migrate(records);
    const strongEdition = catalog.editions.find(
      (edition) => edition.workId === strongWorkId,
    );
    const weakEditions = catalog.editions.filter(
      (edition) => edition.workId !== strongWorkId,
    );

    // Then
    expect(strongEdition).toMatchObject({
      verificationStatus: "partially_verified",
      publicationStatus: "public",
    });
    expect(weakEditions).toHaveLength(2);
    expect(
      weakEditions.every((edition) => edition.publicationStatus === "withheld"),
    ).toBe(true);
    expect(results.at(0)).toMatchObject({ reviewIssues: [] });
  });
});
