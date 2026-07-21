import { describe, expect, it } from "vitest";
import {
  editionCandidate,
  editionView,
  expectEveryPermutationEqual,
  FETCHED,
  RAW_ONLY,
  workCandidate,
  workView,
} from "./legacy-associativity-fixture.js";

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
          candidates: expect.arrayContaining([
            expect.stringContaining("标题=同级标题甲"),
            expect.stringContaining("标题=同级标题乙"),
            expect.stringContaining("标题=同级标题丙"),
          ]),
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
          candidates: expect.arrayContaining([
            expect.stringContaining("同级译者甲 | 2021"),
            expect.stringContaining("同级译者乙 | 2022"),
            expect.stringContaining("同级译者丙 | 2023"),
          ]),
          source: {
            url: "https://bumingbai.net/episodes/associative-41",
          },
        },
      ],
    });
  });
});
