import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CatalogSchema } from "../../src/domain/schemas/catalog.js";
import { WorkSchema } from "../../src/domain/schemas/entities.js";
import { runValidationCli } from "../../tools/validate-data.js";

const GENERATED_AT = "2026-07-14T00:00:00.000Z";
const EMPTY_CATALOG = CatalogSchema.parse({
  schemaVersion: 1,
  generatedAt: GENERATED_AT,
  episodes: [],
  people: [],
  topics: [],
  works: [],
  editions: [],
  recommendationEvidence: [],
  imageAssets: [],
  workRelations: [],
  providerRecords: [],
  reviewIssues: [],
});

describe("validation CLI", () => {
  it("reads catalog files and reports success or validation issues", async () => {
    // Given
    const rootDir = await mkdtemp(join(tmpdir(), "catalog-validation-"));
    const catalogDir = join(rootDir, "data", "catalog");
    const reviewDir = join(rootDir, "data", "review");
    const { schemaVersion, generatedAt, reviewIssues, ...entityFiles } =
      EMPTY_CATALOG;
    const catalogFiles = {
      ...entityFiles,
      meta: { schemaVersion, generatedAt },
    };

    try {
      await Promise.all([
        mkdir(catalogDir, { recursive: true }),
        mkdir(reviewDir, { recursive: true }),
      ]);
      await Promise.all(
        Object.entries(catalogFiles).map(([name, value]) =>
          writeFile(
            join(
              catalogDir,
              `${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}.json`,
            ),
            JSON.stringify(value),
          ),
        ),
      );
      await writeFile(
        join(reviewDir, "issues.json"),
        JSON.stringify(reviewIssues),
      );

      // When
      const successLines: string[] = [];
      const successCode = await runValidationCli(rootDir, (line) => {
        successLines.push(line);
      });
      const publicWork = WorkSchema.parse({
        id: "work_111111111111",
        slug: "the-truce",
        title: "休战",
        mediaType: "book",
        creatorIds: [],
        topicIds: [],
        genres: [],
        regions: [],
        verificationStatus: "verified",
        publicationStatus: "public",
        sources: [],
      });
      await writeFile(
        join(catalogDir, "works.json"),
        JSON.stringify([publicWork]),
      );
      const issueLines: string[] = [];
      const issueCode = await runValidationCli(rootDir, (line) => {
        issueLines.push(line);
      });

      // Then
      expect(successCode).toBe(0);
      expect(successLines).toEqual([expect.stringContaining("episodes=0")]);
      expect(issueCode).toBe(1);
      expect(issueLines).toEqual([
        "public_work_without_evidence work_111111111111 Public Work requires publishable recommendation evidence",
      ]);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
