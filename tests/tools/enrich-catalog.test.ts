import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Catalog } from "../../src/domain/schemas/catalog.js";
import type { ProviderClient } from "../../src/providers/types.js";
import { runEnrichmentCli } from "../../tools/enrich-catalog.js";
import { catalogFixture, createTemporaryRoot } from "../enrichment/fixture.js";

async function writeCatalog(root: string, catalog: Catalog): Promise<void> {
  const catalogDir = join(root, "data", "catalog");
  const reviewDir = join(root, "data", "review");
  await Promise.all([
    mkdir(catalogDir, { recursive: true }),
    mkdir(reviewDir, { recursive: true }),
  ]);
  const files = {
    "meta.json": {
      schemaVersion: catalog.schemaVersion,
      generatedAt: catalog.generatedAt,
    },
    "episodes.json": catalog.episodes,
    "people.json": catalog.people,
    "topics.json": catalog.topics,
    "works.json": catalog.works,
    "editions.json": catalog.editions,
    "recommendation-evidence.json": catalog.recommendationEvidence,
    "image-assets.json": catalog.imageAssets,
    "work-relations.json": catalog.workRelations,
    "provider-records.json": catalog.providerRecords,
  } as const;
  await Promise.all(
    Object.entries(files).map(([name, value]) =>
      writeFile(
        join(catalogDir, name),
        `${JSON.stringify(value, null, 2)}\n`,
        "utf8",
      ),
    ),
  );
  await writeFile(
    join(reviewDir, "issues.json"),
    `${JSON.stringify(catalog.reviewIssues, null, 2)}\n`,
    "utf8",
  );
}

async function outputSnapshot(root: string): Promise<string[]> {
  return Promise.all([
    readFile(join(root, "data/catalog/provider-records.json"), "utf8"),
    readFile(join(root, "data/catalog/image-assets.json"), "utf8"),
    readFile(join(root, "data/catalog/work-relations.json"), "utf8"),
    readFile(join(root, "data/review/issues.json"), "utf8"),
  ]);
}

function required(value: string | undefined): string {
  if (value === undefined) throw new Error("Expected output file contents");
  return value;
}

const forbiddenClient: ProviderClient<unknown> = {
  name: "open_library",
  lookup: async () => {
    throw new Error("offline mode called a provider");
  },
};

describe("runEnrichmentCli", () => {
  it("enriches and atomically writes four validated files offline", async () => {
    const root = await createTemporaryRoot();
    await writeCatalog(root, catalogFixture());
    const lines: string[] = [];

    const exitCode = await runEnrichmentCli(["--offline"], {
      rootDir: root,
      clients: [forbiddenClient],
      env: {
        TMDB_API_TOKEN: "",
        CLOUDFLARE_ACCOUNT_ID: "",
        CLOUDFLARE_API_TOKEN: "",
        PRIVATE_VALUE: "do-not-log",
      },
      now: "2026-07-18T00:00:00.000Z",
      writeLine: (line) => lines.push(line),
    });

    expect(exitCode).toBe(0);
    const [records, images, relations, issues] = await outputSnapshot(root);
    expect(JSON.parse(required(records))).toEqual([]);
    expect(JSON.parse(required(images))).toHaveLength(3);
    expect(JSON.parse(required(relations)).length).toBeGreaterThan(0);
    expect(JSON.parse(required(issues))).toEqual([]);
    expect(lines).toContain("TMDB skipped: TMDB_API_TOKEN is not configured");
    expect(lines).toContain(
      "Workers AI skipped: Cloudflare credentials are not configured",
    );
    expect(lines.join("\n")).not.toContain("do-not-log");
  });

  it("rejects unknown and incompatible flags without changing outputs", async () => {
    const root = await createTemporaryRoot();
    await writeCatalog(root, catalogFixture());
    const before = await outputSnapshot(root);

    const unknown = await runEnrichmentCli(["--unknown"], { rootDir: root });
    const incompatible = await runEnrichmentCli(["--offline", "--refresh"], {
      rootDir: root,
    });

    expect(unknown).toBe(2);
    expect(incompatible).toBe(2);
    await expect(outputSnapshot(root)).resolves.toEqual(before);
  });

  it("keeps all old files when catalog validation fails", async () => {
    const root = await createTemporaryRoot();
    const invalid = { ...catalogFixture(), recommendationEvidence: [] };
    await writeCatalog(root, invalid);
    const before = await outputSnapshot(root);

    const exitCode = await runEnrichmentCli(["--offline"], {
      rootDir: root,
      clients: [],
      now: "2026-07-18T00:00:00.000Z",
    });

    expect(exitCode).toBe(1);
    await expect(outputSnapshot(root)).resolves.toEqual(before);
  });

  it("passes an available embedding client without logging vectors", async () => {
    const root = await createTemporaryRoot();
    await writeCatalog(root, catalogFixture());
    let calls = 0;
    const lines: string[] = [];

    const exitCode = await runEnrichmentCli([], {
      rootDir: root,
      clients: [],
      env: {
        TMDB_API_TOKEN: "",
        CLOUDFLARE_ACCOUNT_ID: "account",
        CLOUDFLARE_API_TOKEN: "token",
      },
      embeddingClient: {
        model: "test-model",
        embed: async (texts) => {
          calls += 1;
          return texts.map(() => [0.25, 0.75]);
        },
      },
      now: "2026-07-18T00:00:00.000Z",
      writeLine: (line) => lines.push(line),
    });

    expect(exitCode).toBe(0);
    expect(calls).toBe(1);
    expect(lines.join("\n")).not.toContain("0.25");
    expect(lines).not.toContain(
      "Workers AI skipped: Cloudflare credentials are not configured",
    );
  });
});
