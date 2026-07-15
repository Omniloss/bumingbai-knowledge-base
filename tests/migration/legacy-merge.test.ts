import { describe, expect, it } from "vitest";
import type {
  Catalog,
  Edition,
  Work,
} from "../../src/domain/schemas/catalog.js";
import { migrateLegacy } from "../../src/migration/legacy.js";

const RETRIEVED_AT = "2026-07-14T00:00:00.000Z";
const FETCHED = "已抓取推荐链接元数据";
const RAW_ONLY = "仅保留节目原文，待人工书目核验";

function episode(number: number, explicit: boolean): object {
  return {
    episode_number: number,
    title: `合并测试节目 ${number}`,
    published_at: "Fri, 17 Jun 2022 09:00:00 GMT",
    official_url: `https://bumingbai.net/episodes/merge-${number}`,
    recommendation_status: explicit
      ? "官方简介明确标注"
      : "官方简介未出现推荐标记",
  };
}

function recommendation(
  episodeNumber: number,
  title: string,
  metadataStatus: string,
  translator = "",
  publicationYear = "",
): object {
  return {
    episode_number: episodeNumber,
    recommendation_order: 1,
    raw_entry: `《${title}》 测试作者 著`,
    title,
    original_title: "Canonical Merge Identity",
    creator: "测试作者",
    media_type: "书籍/文本",
    translator,
    publisher: translator ? "测试出版社" : "",
    publication_year: publicationYear,
    isbn: translator ? "9780000000019" : "",
    metadata_status: metadataStatus,
  };
}

function migrate(
  episodes: readonly object[],
  recommendations: readonly object[],
): Catalog {
  return migrateLegacy(
    { retrieved_at: RETRIEVED_AT, episodes, recommendations },
    RETRIEVED_AT,
  );
}

function workView(work: Work | undefined): object {
  return {
    title: work?.title,
    verificationStatus: work?.verificationStatus,
    publicationStatus: work?.publicationStatus,
    sourceUrls: work?.sources.map((source) => source.url).toSorted() ?? [],
  };
}

function editionView(edition: Edition | undefined, catalog: Catalog): object {
  return {
    title: edition?.title,
    translatorNames:
      edition?.translatorIds
        .map((id) => catalog.people.find((person) => person.id === id)?.name)
        .toSorted() ?? [],
    publishedAt: edition?.publishedAt,
    verificationStatus: edition?.verificationStatus,
    publicationStatus: edition?.publicationStatus,
    sourceUrls: edition?.sources.map((source) => source.url).toSorted() ?? [],
  };
}

function conflictIssue(catalog: Catalog, field: "title" | "isbn"): object {
  return catalog.reviewIssues.find((issue) => issue.field === field) ?? {};
}

describe("legacy entity merge", () => {
  it("selects the stronger Work payload regardless of input order", () => {
    const episodes = [episode(1, false), episode(2, true)];
    const weak = recommendation(1, "低可信标题", FETCHED);
    const strong = recommendation(2, "可信标题", FETCHED);

    const forward = migrate(episodes, [weak, strong]);
    const reverse = migrate(episodes, [strong, weak]);

    expect(workView(forward.works[0])).toEqual(workView(reverse.works[0]));
    expect(workView(forward.works[0])).toEqual({
      title: "可信标题",
      verificationStatus: "partially_verified",
      publicationStatus: "public",
      sourceUrls: [
        "https://bumingbai.net/episodes/merge-1",
        "https://bumingbai.net/episodes/merge-2",
      ],
    });
    expect(forward.reviewIssues.some((issue) => issue.field === "title")).toBe(
      false,
    );
    expect(conflictIssue(forward, "title")).toEqual(
      conflictIssue(reverse, "title"),
    );
  });

  it("selects the stronger Edition payload regardless of input order", () => {
    const episodes = [episode(1, true), episode(2, true)];
    const weak = recommendation(1, "合并版本", RAW_ONLY, "未核实译者", "1999");
    const strong = recommendation(2, "合并版本", FETCHED, "可信译者", "2026");

    const forward = migrate(episodes, [weak, strong]);
    const reverse = migrate(episodes, [strong, weak]);

    expect(editionView(forward.editions[0], forward)).toEqual(
      editionView(reverse.editions[0], reverse),
    );
    expect(editionView(forward.editions[0], forward)).toMatchObject({
      translatorNames: ["可信译者"],
      publishedAt: "2026",
      verificationStatus: "partially_verified",
      publicationStatus: "public",
    });
    expect(forward.reviewIssues.some((issue) => issue.field === "isbn")).toBe(
      false,
    );
    expect(conflictIssue(forward, "isbn")).toEqual(
      conflictIssue(reverse, "isbn"),
    );
  });

  it("withholds an equal-confidence conflicting Work deterministically", () => {
    const episodes = [episode(1, true), episode(2, true)];
    const first = recommendation(1, "冲突标题甲", FETCHED);
    const second = recommendation(2, "冲突标题乙", FETCHED);

    const forward = migrate(episodes, [first, second]);
    const reverse = migrate(episodes, [second, first]);

    expect(workView(forward.works[0])).toEqual(workView(reverse.works[0]));
    expect(forward.works[0]).toMatchObject({
      verificationStatus: "pending_verification",
      publicationStatus: "withheld",
    });
    expect(forward.reviewIssues.some((issue) => issue.field === "title")).toBe(
      true,
    );
    expect(conflictIssue(forward, "title")).toEqual(
      conflictIssue(reverse, "title"),
    );
  });

  it("withholds an equal-confidence conflicting Edition deterministically", () => {
    const episodes = [episode(1, true), episode(2, true)];
    const first = recommendation(1, "冲突版本", FETCHED, "译者甲", "2020");
    const second = recommendation(2, "冲突版本", FETCHED, "译者乙", "2021");

    const forward = migrate(episodes, [first, second]);
    const reverse = migrate(episodes, [second, first]);

    expect(editionView(forward.editions[0], forward)).toEqual(
      editionView(reverse.editions[0], reverse),
    );
    expect(forward.editions[0]).toMatchObject({
      verificationStatus: "pending_verification",
      publicationStatus: "withheld",
    });
    expect(forward.reviewIssues.some((issue) => issue.field === "isbn")).toBe(
      true,
    );
    expect(conflictIssue(forward, "isbn")).toEqual(
      conflictIssue(reverse, "isbn"),
    );
  });
});
