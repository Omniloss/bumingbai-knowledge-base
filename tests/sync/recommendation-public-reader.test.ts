import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("keeps the review queue out of public catalog and search code", async () => {
  const publicReaders = await Promise.all([
    readFile("src/lib/catalog.ts", "utf8"),
    readFile("tools/build-search-index.ts", "utf8"),
  ]);

  for (const reader of publicReaders) {
    expect(reader).not.toContain("sync-candidates.json");
  }
});
