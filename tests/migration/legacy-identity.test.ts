import { describe, expect, it } from "vitest";
import { createStableId } from "../../src/domain/id.js";
import type { Catalog } from "../../src/domain/schemas/catalog.js";
import {
  LegacyEpisodeReferenceError,
  migrateLegacy,
} from "../../src/migration/legacy.js";

const RETRIEVED_AT = "2026-07-14T00:00:00.000Z";
const SHARED_URL = "https://bumingbai.net/episodes/shared-source";
const SPECIAL_PUBLISHED_AT = "2026-07-01T09:00:00.000Z";
const SPECIAL_RAW_ENTRY = "《特别节目推荐》 测试作者 著";

const NUMBERED_EPISODE = {
  episode_number: 4,
  title: "编号原节目",
  published_at: "Fri, 17 Jun 2022 09:00:00 GMT",
  official_url: SHARED_URL,
  recommendation_status: "官方简介明确标注",
} as const;

const SPECIAL_EPISODE = {
  episode_number: null,
  title: "无编号重播",
  published_at: "Wed, 01 Jul 2026 09:00:00 GMT",
  official_url: SHARED_URL,
  recommendation_status: "官方简介明确标注",
} as const;

function specialRecommendation(
  publishedAt: string,
  rawEntry = SPECIAL_RAW_ENTRY,
): object {
  return {
    episode_number: null,
    episode_official_url: SHARED_URL,
    episode_published_at: publishedAt,
    recommendation_order: 1,
    raw_entry: rawEntry,
    title: rawEntry.includes("另一场") ? "另一场推荐" : "特别节目推荐",
    creator: "测试作者",
    media_type: "书籍/文本",
    metadata_status: "已抓取推荐链接元数据",
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

function identityView(catalog: Catalog): object {
  return {
    episodes: catalog.episodes
      .map((episode) => ({
        id: episode.id,
        publishedAt: episode.publishedAt,
        slug: episode.slug,
      }))
      .toSorted((left, right) =>
        left.publishedAt.localeCompare(right.publishedAt),
      ),
    evidence: catalog.recommendationEvidence
      .map((evidence) => ({
        id: evidence.id,
        episodeId: evidence.episodeId,
        rawText: evidence.rawText,
      }))
      .toSorted((left, right) => left.rawText.localeCompare(right.rawText)),
  };
}

describe("legacy episode identity", () => {
  it("keeps numbered episode IDs and slugs byte-compatible", () => {
    // Given
    const input = [NUMBERED_EPISODE];

    // When
    const catalog = migrate(input, []);

    // Then
    expect(catalog.episodes[0]).toMatchObject({
      id: createStableId("episode", "4"),
      slug: "ep-004",
      number: 4,
    });
  });

  it("joins an unnumbered recommendation by URL and publication time", () => {
    // Given
    const recommendation = specialRecommendation(
      "Wed, 01 Jul 2026 09:00:00 GMT",
    );
    const episodeId = createStableId(
      "episode",
      SHARED_URL,
      SPECIAL_PUBLISHED_AT,
    );

    // When
    const catalog = migrate([SPECIAL_EPISODE], [recommendation]);

    // Then
    expect(catalog.episodes[0]).toMatchObject({
      id: episodeId,
      slug: `special-${episodeId.slice(-6)}`,
      number: null,
      publishedAt: SPECIAL_PUBLISHED_AT,
    });
    expect(catalog.recommendationEvidence[0]).toMatchObject({
      id: createStableId(
        "evidence",
        SHARED_URL,
        SPECIAL_PUBLISHED_AT,
        "1",
        SPECIAL_RAW_ENTRY,
      ),
      episodeId,
    });
  });

  it("selects an unnumbered replay by publication time when URLs are shared", () => {
    // Given
    const recommendation = specialRecommendation(SPECIAL_PUBLISHED_AT);
    const replayId = createStableId(
      "episode",
      SHARED_URL,
      SPECIAL_PUBLISHED_AT,
    );

    // When
    const catalog = migrate(
      [NUMBERED_EPISODE, SPECIAL_EPISODE],
      [recommendation],
    );

    // Then
    expect(catalog.recommendationEvidence[0]?.episodeId).toBe(replayId);
    expect(catalog.recommendationEvidence[0]?.episodeId).not.toBe(
      createStableId("episode", "4"),
    );
  });

  it("throws a typed lookup error for an unmatched unnumbered recommendation", () => {
    // Given
    const missingPublishedAt = "2026-07-02T09:00:00.000Z";
    const input = specialRecommendation(missingPublishedAt);
    let caught: unknown;

    // When
    try {
      migrate([SPECIAL_EPISODE], [input]);
    } catch (error) {
      caught = error;
    }

    // Then
    if (!(caught instanceof LegacyEpisodeReferenceError)) {
      expect(caught).toBeInstanceOf(LegacyEpisodeReferenceError);
      return;
    }
    expect(caught.message).toContain(`official URL ${SHARED_URL}`);
    expect(caught.message).toContain(`published at ${missingPublishedAt}`);
    expect(caught.message).not.toContain("episode null");
  });

  it("keeps special identities and joins independent of input order", () => {
    // Given
    const laterEpisode = {
      ...SPECIAL_EPISODE,
      title: "另一场无编号节目",
      published_at: "Thu, 02 Jul 2026 09:00:00 GMT",
    };
    const firstRecommendation = specialRecommendation(SPECIAL_PUBLISHED_AT);
    const laterRecommendation = specialRecommendation(
      "2026-07-02T09:00:00.000Z",
      "《另一场推荐》 测试作者 著",
    );

    // When
    const forward = migrate(
      [SPECIAL_EPISODE, laterEpisode],
      [firstRecommendation, laterRecommendation],
    );
    const reverse = migrate(
      [laterEpisode, SPECIAL_EPISODE],
      [laterRecommendation, firstRecommendation],
    );

    // Then
    expect(identityView(forward)).toEqual(identityView(reverse));
    expect(new Set(forward.episodes.map((episode) => episode.id)).size).toBe(2);
    expect(
      new Set(
        forward.recommendationEvidence.map((evidence) => evidence.episodeId),
      ).size,
    ).toBe(2);
  });
});
