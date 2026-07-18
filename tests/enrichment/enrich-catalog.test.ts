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

describe("enrichCatalog", () => {
  it("creates traceable records, images, hard relations and structured similarity", async () => {
    const client = openLibraryClient((query) => ({
      provider: "open_library",
      retrievedAt: now,
      records:
        query.workId === "work_000000000001"
          ? [
              {
                externalId: "OL1W",
                title: "First Work",
                authorNames: ["Author One"],
                firstPublishYear: 2001,
                cover: {
                  handling: "hotlink_only",
                  url: "https://covers.openlibrary.org/b/id/1-L.jpg?default=false",
                  sourcePageUrl: "https://openlibrary.org/works/OL1W",
                  width: 1200,
                  height: 1800,
                },
              },
            ]
          : [],
    }));

    const result = await enrichCatalog(catalogFixture(), [client], {
      cacheRoot: await createTemporaryRoot(),
      now,
    });

    expect(result.providerRecords).toHaveLength(3);
    expect(
      result.providerRecords.every(
        (record) => record.normalizedHash.length === 64,
      ),
    ).toBe(true);
    expect(result.imageAssets).toContainEqual(
      expect.objectContaining({
        workId: "work_000000000001",
        role: "hero",
        width: 1200,
        height: 1800,
      }),
    );
    expect(
      result.workRelations.some((relation) => relation.kind === "same_creator"),
    ).toBe(true);
    expect(
      result.workRelations.some(
        (relation) =>
          relation.kind === "similar" &&
          relation.fromWorkId === "work_000000000001" &&
          relation.toWorkId === "work_000000000003" &&
          (relation.score ?? 0) >= 0.25,
      ),
    ).toBe(true);
    expect(
      result.reviewIssues.every((issue) => issue.source.url.length > 0),
    ).toBe(true);
  });

  it("skips unchanged fingerprints and refreshes changed work lookups", async () => {
    let calls = 0;
    const client = openLibraryClient(() => {
      calls += 1;
      return { provider: "open_library", retrievedAt: now, records: [] };
    });
    const root = await createTemporaryRoot();
    const first = await enrichCatalog(catalogFixture(), [client], {
      cacheRoot: root,
      now,
    });
    const unchanged = await enrichCatalog(first, [client], {
      cacheRoot: root,
      now,
    });
    const changed = CatalogSchema.parse({
      ...unchanged,
      works: unchanged.works.map((work) =>
        work.id === "work_000000000001"
          ? { ...work, title: "First Work Revised" }
          : work,
      ),
    });
    await enrichCatalog(changed, [client], { cacheRoot: root, now });

    expect(calls).toBe(4);
    expect(
      first.providerRecords.every((record) => record.externalId === "no-match"),
    ).toBe(true);
  });

  it("uses cache offline and preserves existing data without a cache", async () => {
    const online = openLibraryClient((query) => ({
      provider: "open_library",
      retrievedAt: now,
      records: [
        {
          externalId: `cached-${query.workId}`,
          title: query.title,
          authorNames: [],
        },
      ],
    }));
    const root = await createTemporaryRoot();
    const cached = await enrichCatalog(catalogFixture(), [online], {
      cacheRoot: root,
      now,
    });
    const offlineClient = openLibraryClient(() => {
      throw new Error("offline client must not be called");
    });
    const offline = await enrichCatalog(catalogFixture(), [offlineClient], {
      cacheRoot: root,
      now,
      offline: true,
    });
    const noCache = await enrichCatalog(cached, [offlineClient], {
      cacheRoot: await createTemporaryRoot(),
      now,
      offline: true,
      forceRefresh: true,
    });

    expect(offline.providerRecords.map((record) => record.externalId)).toEqual(
      cached.providerRecords.map((record) => record.externalId),
    );
    expect(noCache.providerRecords).toEqual(cached.providerRecords);
  });

  it("reviews conflicting candidates without changing work facts", async () => {
    const client = openLibraryClient((query) => ({
      provider: "open_library",
      retrievedAt: now,
      records:
        query.workId === "work_000000000001"
          ? [
              {
                externalId: "OL-CONFLICT",
                title: "Wrong Title",
                authorNames: ["Wrong Author"],
                firstPublishYear: 1999,
              },
            ]
          : [],
    }));
    const result = await enrichCatalog(catalogFixture(), [client], {
      cacheRoot: await createTemporaryRoot(),
      now,
    });

    expect(result.works[0]?.title).toBe("First Work");
    expect(result.reviewIssues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining(["title", "creatorIds", "year"]),
    );
    expect(
      result.reviewIssues.every(
        (issue) => issue.source.kind === "provider_api",
      ),
    ).toBe(true);
    expect(JSON.stringify(result.reviewIssues)).not.toContain("response");
  });

  it("uses and caches optional vectors only to strengthen structured similarity", async () => {
    const catalog = CatalogSchema.parse({
      ...catalogFixture(),
      works: catalogFixture().works.map((work) => ({
        ...work,
        topicIds: [],
        regions: [],
        year: undefined,
      })),
    });
    let calls = 0;
    const embeddingClient = {
      model: "test-embedding-model",
      embed: async (texts: readonly string[]) => {
        calls += 1;
        return texts.map(() => [1, 0]);
      },
    };
    const root = await createTemporaryRoot();
    const online = await enrichCatalog(catalog, [], {
      cacheRoot: root,
      now,
      embeddingClient,
    });
    const offline = await enrichCatalog(catalog, [], {
      cacheRoot: root,
      now,
      offline: true,
      embeddingClient: {
        ...embeddingClient,
        embed: async () => {
          throw new Error("offline mode called embeddings");
        },
      },
    });

    expect(calls).toBe(1);
    expect(online.workRelations).toContainEqual(
      expect.objectContaining({
        kind: "similar",
        fromWorkId: "work_000000000001",
        toWorkId: "work_000000000003",
        score: 0.25,
        reasons: ["体裁或媒介相同"],
      }),
    );
    expect(offline.workRelations).toEqual(online.workRelations);
    expect(JSON.stringify(online)).not.toContain("test-embedding-model");
    expect(JSON.stringify(online)).not.toContain("[1,0]");
  });

  it("preserves the order of existing review issues", async () => {
    const catalog = CatalogSchema.parse({
      ...catalogFixture(),
      reviewIssues: [
        {
          id: "issue_ffffffffffff",
          entityId: "work_000000000001",
          field: "title",
          reason: "First existing issue",
          candidates: ["First Work"],
          source: {
            ...catalogFixture().works[0]?.sources[0],
            kind: "manual_review",
          },
          status: "open",
        },
        {
          id: "issue_000000000000",
          entityId: "work_000000000002",
          field: "title",
          reason: "Second existing issue",
          candidates: ["Second Work"],
          source: {
            ...catalogFixture().works[1]?.sources[0],
            kind: "manual_review",
          },
          status: "open",
        },
      ],
    });

    const result = await enrichCatalog(catalog, [], {
      cacheRoot: await createTemporaryRoot(),
      now,
      offline: true,
    });

    expect(result.reviewIssues.map((issue) => issue.id)).toEqual([
      "issue_ffffffffffff",
      "issue_000000000000",
    ]);
  });
});
