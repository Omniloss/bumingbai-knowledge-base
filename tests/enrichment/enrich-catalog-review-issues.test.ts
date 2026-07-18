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

function wikidataRecord(instanceOf: string[], publicationYears: number[]) {
  return {
    externalId: "Q-CONFLICT",
    externalIds: {},
    instanceOf,
    license: "CC0" as const,
    publicationYears,
    sourcePageUrl: "https://www.wikidata.org/wiki/Q-CONFLICT",
    title: "First Work",
  };
}

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

  it("preserves Wikidata issue statuses when semantic claims are reordered and duplicated", async () => {
    const root = await createTemporaryRoot();
    let reordered = false;
    const wikidataClient: ProviderClient<unknown> = {
      name: "wikidata",
      lookup: async (query) => ({
        provider: "wikidata",
        retrievedAt: now,
        records:
          query.workId === "work_000000000001"
            ? [
                reordered
                  ? wikidataRecord(
                      ["Q24634210", "Q11424", "Q24634210"],
                      [2000, 1999, 2000],
                    )
                  : wikidataRecord(["Q11424", "Q24634210"], [1999, 2000]),
              ]
            : [],
      }),
    };
    const first = await enrichCatalog(catalogFixture(), [wikidataClient], {
      cacheRoot: root,
      now,
    });
    const issueIds = new Map(
      first.reviewIssues.map((issue) => [issue.field, issue.id]),
    );
    const catalog = CatalogSchema.parse({
      ...first,
      reviewIssues: first.reviewIssues.map((issue) => ({
        ...issue,
        status: issue.field === "mediaType" ? "resolved" : "dismissed",
      })),
    });
    reordered = true;

    const result = await enrichCatalog(catalog, [wikidataClient], {
      cacheRoot: root,
      forceRefresh: true,
      now,
    });
    const identityIssues = result.reviewIssues.filter((issue) =>
      ["mediaType", "year"].includes(issue.field),
    );

    expect(identityIssues).toHaveLength(2);
    expect(identityIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "mediaType",
          id: issueIds.get("mediaType"),
          status: "resolved",
        }),
        expect.objectContaining({
          field: "year",
          id: issueIds.get("year"),
          status: "dismissed",
        }),
      ]),
    );
  });
});
