import { describe, expect, it } from "vitest";
import { WorkSchema } from "../../src/domain/schemas/entities.js";
import {
  createCatalogFixture,
  EMPTY_COUNT_LINE,
  importCatalogModule,
  removeCatalogFixture,
  runCatalogEntry,
  writeWorksFile,
} from "./catalog-cli-fixture.js";

describe("validate-data entrypoint", () => {
  it("prints exact counts and exits zero for a valid catalog", async () => {
    // Given
    const fixture = await createCatalogFixture();

    try {
      // When
      const result = runCatalogEntry(fixture.rootDir);

      // Then
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(EMPTY_COUNT_LINE);
      expect(result.stderr).toBe("");
    } finally {
      await removeCatalogFixture(fixture);
    }
  });

  it("prints the exact issue and exits one for an invalid public Work", async () => {
    // Given
    const fixture = await createCatalogFixture();
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

    try {
      await writeWorksFile(fixture, [publicWork]);

      // When
      const result = runCatalogEntry(fixture.rootDir);

      // Then
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe(
        "public_work_without_evidence work_111111111111 Public Work requires publishable recommendation evidence\n",
      );
      expect(result.stderr).toBe("");
    } finally {
      await removeCatalogFixture(fixture);
    }
  });

  it("does not execute the CLI when imported", () => {
    // Given
    // When
    const result = importCatalogModule();

    // Then
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("rejects an invalid catalog at the Zod boundary", async () => {
    // Given
    const fixture = await createCatalogFixture();

    try {
      await writeWorksFile(fixture, [{ id: "work_111111111111" }]);

      // When
      const result = runCatalogEntry(fixture.rootDir);

      // Then
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("ZodError");
    } finally {
      await removeCatalogFixture(fixture);
    }
  });
});
