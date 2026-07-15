import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CatalogMetaSchema } from "../../src/domain/schemas/catalog.js";
import {
  ReviewIssueSchema,
  WorkSchema,
} from "../../src/domain/schemas/entities.js";

const execFileAsync = promisify(execFile);

describe("migrate-legacy CLI", () => {
  it("writes catalog and review JSON when invoked with explicit paths", async () => {
    // Given
    const projectRoot = resolve(".");
    const temporaryRoot = await mkdtemp(join(tmpdir(), "bumingbai-migration-"));
    const outputDir = join(temporaryRoot, "catalog");

    try {
      // When
      await execFileAsync(
        "bun",
        [
          "run",
          join(projectRoot, "tools", "migrate-legacy.ts"),
          join(projectRoot, "tests", "fixtures", "legacy-small.json"),
          outputDir,
        ],
        { cwd: temporaryRoot },
      );

      // Then
      const meta = CatalogMetaSchema.parse(
        JSON.parse(await readFile(join(outputDir, "meta.json"), "utf8")),
      );
      const works = z
        .array(WorkSchema)
        .parse(
          JSON.parse(await readFile(join(outputDir, "works.json"), "utf8")),
        );
      const issues = z
        .array(ReviewIssueSchema)
        .parse(
          JSON.parse(
            await readFile(
              join(temporaryRoot, "data", "review", "issues.json"),
              "utf8",
            ),
          ),
        );
      expect(meta.schemaVersion).toBe(1);
      expect(works).toHaveLength(1);
      expect(issues).toEqual([]);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
