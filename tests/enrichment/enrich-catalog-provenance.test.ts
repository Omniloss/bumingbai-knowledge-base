import { describe, expect, it } from "vitest";
import { CatalogSchema } from "../../src/domain/schemas/catalog.js";
import { enrichCatalog } from "../../src/enrichment/enrich-catalog.js";
import type {
  ProviderClient,
  ProviderResult,
  WorkLookup,
} from "../../src/providers/types.js";
import { catalogFixture, createTemporaryRoot, now } from "./fixture.js";

function openLibraryClient(
  lookup: (query: WorkLookup) => ProviderResult<unknown>,
): ProviderClient<unknown> {
  return { name: "open_library", lookup: async (query) => lookup(query) };
}

function changedFirstWork(catalog: ReturnType<typeof catalogFixture>) {
  return CatalogSchema.parse({
    ...catalog,
    works: catalog.works.map((work) =>
      work.id === "work_000000000001"
        ? { ...work, title: "First Work Revised" }
        : work,
    ),
  });
}

describe("enrichCatalog cache provenance", () => {
  it("preserves prior enrichment when a changed lookup fails, then retries the new fingerprint", async () => {
    const root = await createTemporaryRoot();
    const initial = openLibraryClient((query) => ({
      provider: "open_library",
      retrievedAt: now,
      records:
        query.workId === "work_000000000001"
          ? [
              {
                externalId: "OL-A",
                title: query.title,
                authorNames: ["Unexpected Author"],
                cover: {
                  handling: "hotlink_only",
                  url: "https://covers.openlibrary.org/b/id/1-L.jpg?default=false",
                  sourcePageUrl: "https://openlibrary.org/works/OL-A",
                  width: 1200,
                  height: 1800,
                },
              },
            ]
          : [],
    }));
    const first = await enrichCatalog(catalogFixture(), [initial], {
      cacheRoot: root,
      now,
    });
    const firstRecord = first.providerRecords.find(
      (record) => record.externalId === "OL-A",
    );
    if (firstRecord === undefined) throw new Error("Expected initial record");
    const changed = changedFirstWork(first);
    const failing: ProviderClient<unknown> = {
      name: "open_library",
      lookup: async () => {
        throw new Error("provider unavailable");
      },
    };

    const preserved = await enrichCatalog(changed, [failing], {
      cacheRoot: root,
      now,
    });

    expect(preserved.providerRecords).toContainEqual(firstRecord);
    expect(
      preserved.imageAssets.some(
        (image) => image.workId === firstRecord.entityId,
      ),
    ).toBe(true);
    expect(
      preserved.reviewIssues.some(
        (issue) => issue.entityId === firstRecord.entityId,
      ),
    ).toBe(true);

    let refreshCalls = 0;
    const refreshed = await enrichCatalog(
      preserved,
      [
        openLibraryClient((query) => {
          refreshCalls += 1;
          return {
            provider: "open_library",
            retrievedAt: now,
            records:
              query.workId === "work_000000000001"
                ? [
                    {
                      externalId: "OL-B",
                      title: query.title,
                      authorNames: ["Author One"],
                    },
                  ]
                : [],
          };
        }),
      ],
      { cacheRoot: root, now },
    );

    expect(refreshCalls).toBeGreaterThan(0);
    expect(refreshed.providerRecords).toContainEqual(
      expect.objectContaining({
        externalId: "OL-B",
        normalizedHash: expect.not.stringMatching(
          new RegExp(`^${firstRecord.normalizedHash}$`),
        ),
      }),
    );
  });

  it("does not promote a successful empty cache entry to a different lookup fingerprint", async () => {
    const root = await createTemporaryRoot();
    const first = await enrichCatalog(
      catalogFixture(),
      [
        openLibraryClient(() => ({
          provider: "open_library",
          retrievedAt: now,
          records: [],
        })),
      ],
      { cacheRoot: root, now },
    );
    const oldRecord = first.providerRecords.find(
      (record) => record.entityId === "work_000000000001",
    );
    if (oldRecord === undefined)
      throw new Error("Expected cached no-match record");

    const preserved = await enrichCatalog(
      changedFirstWork(first),
      [
        {
          name: "open_library",
          lookup: async () => {
            throw new Error("offline mode must not call provider");
          },
        },
      ],
      { cacheRoot: root, now, offline: true },
    );

    expect(preserved.providerRecords).toContainEqual(oldRecord);
  });
});
