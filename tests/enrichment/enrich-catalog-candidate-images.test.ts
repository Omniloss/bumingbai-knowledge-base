import { describe, expect, it } from "vitest";
import { enrichCatalog } from "../../src/enrichment/enrich-catalog.js";
import { selectHeroImage } from "../../src/images/policy.js";
import type { ProviderClient } from "../../src/providers/types.js";
import { catalogFixture, createTemporaryRoot, now } from "./fixture.js";

describe("enrichCatalog candidate images", () => {
  it("keeps conflicting candidates reviewable without publishing their images", async () => {
    const client: ProviderClient<unknown> = {
      name: "wikidata",
      lookup: async (query) => ({
        provider: "wikidata",
        retrievedAt: now,
        records:
          query.workId === "work_000000000001"
            ? [
                {
                  externalId: "Q-WRONG",
                  title: "Wrong Title",
                  sourcePageUrl: "https://www.wikidata.org/wiki/Q-WRONG",
                  license: "CC0",
                  externalIds: {},
                  image: {
                    url: "https://commons.wikimedia.org/wrong.jpg",
                    sourcePageUrl:
                      "https://commons.wikimedia.org/wiki/File:wrong.jpg",
                    license: "CC BY 4.0",
                    artist: "Wrong Artist",
                    credit: "Wrong Credit",
                    attribution: "Wrong Credit; Wrong Artist",
                    width: 1200,
                    height: 1800,
                    handling: "mirror_allowed",
                  },
                },
                {
                  externalId: "Q-RIGHT",
                  title: query.title,
                  sourcePageUrl: "https://www.wikidata.org/wiki/Q-RIGHT",
                  license: "CC0",
                  externalIds: {},
                  image: {
                    url: "https://commons.wikimedia.org/right.jpg",
                    sourcePageUrl:
                      "https://commons.wikimedia.org/wiki/File:right.jpg",
                    license: "CC BY 4.0",
                    artist: "Right Artist",
                    credit: "Right Credit",
                    attribution: "Right Credit; Right Artist",
                    width: 1200,
                    height: 1800,
                    handling: "mirror_allowed",
                  },
                },
              ]
            : [],
      }),
    };
    const result = await enrichCatalog(catalogFixture(), [client], {
      cacheRoot: await createTemporaryRoot(),
      now,
    });
    const work = result.works[0];
    if (work === undefined) throw new Error("Expected first work");

    expect(result.providerRecords.map((record) => record.externalId)).toContain(
      "Q-WRONG",
    );
    expect(result.reviewIssues).toContainEqual(
      expect.objectContaining({ field: "title" }),
    );
    expect(result.imageAssets.map((image) => image.url)).not.toContain(
      "https://commons.wikimedia.org/wrong.jpg",
    );
    expect(result.imageAssets.map((image) => image.url)).toContain(
      "https://commons.wikimedia.org/right.jpg",
    );
    expect(selectHeroImage(work, [...result.imageAssets], now).url).toBe(
      "https://commons.wikimedia.org/right.jpg",
    );
  });
});
