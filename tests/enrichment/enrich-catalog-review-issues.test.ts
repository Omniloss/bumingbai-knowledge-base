import { describe, expect, it } from "vitest";
import { CatalogSchema } from "../../src/domain/schemas/catalog.js";
import { enrichCatalog } from "../../src/enrichment/enrich-catalog.js";
import type { ProviderClient } from "../../src/providers/types.js";
import { catalogFixture, createTemporaryRoot, now } from "./fixture.js";

const conflictingClient: ProviderClient<unknown> = {
  name: "open_library",
  lookup: async (query) => ({
    provider: "open_library",
    retrievedAt: now,
    records:
      query.workId === "work_000000000001"
        ? [
            {
              externalId: "OL-CONFLICT",
              title: "Wrong Title",
              authorNames: ["Wrong Author"],
            },
          ]
        : [],
  }),
};

describe("enrichCatalog review issue deduplication", () => {
  it("preserves resolved and dismissed statuses when regenerated issues have the same IDs", async () => {
    const root = await createTemporaryRoot();
    const first = await enrichCatalog(catalogFixture(), [conflictingClient], {
      cacheRoot: root,
      now,
    });
    const catalog = CatalogSchema.parse({
      ...first,
      reviewIssues: first.reviewIssues.map((issue) => ({
        ...issue,
        status: issue.field === "title" ? "resolved" : "dismissed",
      })),
    });

    const result = await enrichCatalog(catalog, [conflictingClient], {
      cacheRoot: root,
      forceRefresh: true,
      now,
    });

    expect(
      result.reviewIssues.find((issue) => issue.field === "title")?.status,
    ).toBe("resolved");
    expect(
      result.reviewIssues.find((issue) => issue.field === "creatorIds")?.status,
    ).toBe("dismissed");
  });
});
