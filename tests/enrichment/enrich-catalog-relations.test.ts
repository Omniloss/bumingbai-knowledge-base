import { describe, expect, it } from "vitest";
import { CatalogSchema } from "../../src/domain/schemas/catalog.js";
import { enrichCatalog } from "../../src/enrichment/enrich-catalog.js";
import { catalogFixture, createTemporaryRoot, now } from "./fixture.js";

function catalogWithSevenSimilarTargets() {
  const base = catalogFixture();
  const works = Array.from({ length: 8 }, (_, index) => {
    const id = `work_${String(index + 1).padStart(12, "0")}`;
    if (index === 0) {
      return {
        ...base.works[0],
        id,
        creatorIds: [],
        originalTitle: undefined,
      };
    }
    const regional = index === 1 || index >= 3;
    return {
      ...base.works[0],
      id,
      slug: `similar-work-${index + 1}`,
      title: `Similar Work ${index + 1}`,
      originalTitle: undefined,
      creatorIds: [],
      topicIds: index < 3 ? ["topic_000000000001"] : [],
      regions: regional ? ["US"] : [],
      year: regional ? 2002 : undefined,
    };
  });
  return CatalogSchema.parse({
    ...base,
    works,
    episodes: Array.from({ length: 8 }, (_, index) => ({
      ...base.episodes[0],
      id: `episode_${String(index + 1).padStart(12, "0")}`,
      number: index + 1,
      slug: `similar-episode-${index + 1}`,
      officialUrl: `https://example.com/similar-episode-${index + 1}`,
    })),
    recommendationEvidence: Array.from({ length: 8 }, (_, index) => ({
      ...base.recommendationEvidence[0],
      id: `evidence_${String(index + 1).padStart(12, "0")}`,
      episodeId: `episode_${String(index + 1).padStart(12, "0")}`,
      workId: `work_${String(index + 1).padStart(12, "0")}`,
    })),
  });
}

describe("enrichCatalog similar relation ordering", () => {
  it("keeps each work's top six similar relations in score and target order", async () => {
    const catalog = catalogWithSevenSimilarTargets();
    const result = await enrichCatalog(catalog, [], {
      cacheRoot: await createTemporaryRoot(),
      now,
      offline: true,
    });
    const relations = result.workRelations.filter(
      (relation) =>
        relation.kind === "similar" &&
        relation.fromWorkId === "work_000000000001",
    );

    expect(relations.map((relation) => relation.toWorkId)).toEqual([
      "work_000000000002",
      "work_000000000003",
      "work_000000000004",
      "work_000000000005",
      "work_000000000006",
      "work_000000000007",
    ]);
    expect(relations.map((relation) => relation.score)).toEqual([
      0.5, 0.4, 0.25, 0.25, 0.25, 0.25,
    ]);
  });
});
