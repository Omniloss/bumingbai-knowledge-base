import { describe, expect, it } from "vitest";
import { CatalogSchema } from "../../src/domain/schemas/catalog.js";
import { enrichCatalog } from "../../src/enrichment/enrich-catalog.js";
import { catalogFixture, createTemporaryRoot, now } from "./fixture.js";

describe("enrichCatalog embeddings", () => {
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
