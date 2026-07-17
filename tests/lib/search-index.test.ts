import { describe, expect, it } from "vitest";
import { CatalogSchema } from "../../src/domain/schemas/catalog.js";
import { loadCatalog } from "../../src/lib/catalog.js";
import {
  rankSearchRecords,
  SearchIndexSchema,
  SearchRecordSchema,
} from "../../src/lib/search.js";
import {
  buildSearchIndex,
  serializeSearchIndex,
} from "../../src/lib/search-index.js";

describe("search index contract", () => {
  it("accepts only internal catalog result paths", () => {
    // Given
    const record = {
      aliases: [],
      id: "work-1",
      kind: "work",
      title: "记忆",
      tokens: ["记忆"],
      url: "https://example.com/works/remember/",
    };

    // When
    const result = SearchRecordSchema.safeParse(record);

    // Then
    expect(result.success).toBe(false);
  });

  it("orders title and alias prefixes before token-only matches", () => {
    // Given
    const records = SearchIndexSchema.parse([
      {
        aliases: [],
        id: "token",
        kind: "work",
        title: "另一部作品",
        tokens: ["记忆"],
        url: "/works/token/",
      },
      {
        aliases: ["记忆别名"],
        id: "prefix",
        kind: "work",
        title: "作品",
        tokens: ["记忆"],
        url: "/works/prefix/",
      },
    ]);

    // When
    const ranked = rankSearchRecords(records, "记忆");

    // Then
    expect(ranked.map((record) => record.id)).toEqual(["prefix", "token"]);
  });

  it("emits only public verified records in deterministic LF-terminated JSON", async () => {
    // Given
    const catalog = await loadCatalog();
    const reversedCatalog = CatalogSchema.parse({
      ...catalog,
      episodes: [...catalog.episodes].reverse(),
      people: [...catalog.people].reverse(),
      topics: [...catalog.topics].reverse(),
      works: [...catalog.works].reverse(),
    });
    const withheldIds = new Set<string>(
      [
        ...catalog.episodes,
        ...catalog.people,
        ...catalog.topics,
        ...catalog.works,
      ]
        .filter(
          (entity) =>
            entity.publicationStatus !== "public" ||
            (entity.verificationStatus !== "verified" &&
              entity.verificationStatus !== "partially_verified"),
        )
        .map((entity) => entity.id),
    );

    // When
    const output = serializeSearchIndex(buildSearchIndex(catalog));
    const reversedOutput = serializeSearchIndex(
      buildSearchIndex(reversedCatalog),
    );
    const parsed = SearchIndexSchema.parse(JSON.parse(output));

    // Then
    expect(output.endsWith("\n")).toBe(true);
    expect(output).toBe(reversedOutput);
    expect(parsed.some((record) => withheldIds.has(record.id))).toBe(false);
  });
});
