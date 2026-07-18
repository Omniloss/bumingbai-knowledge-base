import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RecommendationCandidate } from "../../src/sync/recommendation-parser.js";
import { writeRecommendationCandidateQueue } from "../../src/sync/run-sync.js";

function candidate(rawText: string): RecommendationCandidate {
  return {
    episodeNumber: 223,
    rawText,
    sourceUrl: "https://bumingbai.net/episodes/ep-223/",
    retrievedAt: "2026-07-18T00:00:00.000Z",
    locator: "html > body > p:nth-of-type(1)",
    risk: "high",
    status: "pending_verification",
  };
}

describe("cold-start recommendation queue writes", () => {
  it("serializes twenty fresh-root calls and leaves the final caller's queue", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-candidates-"));
    const writes = Array.from({ length: 20 }, (_, index) =>
      writeRecommendationCandidateQueue(root, [candidate(`《${index}》`)]),
    );

    const results = await Promise.allSettled(writes);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(20);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(0);
    await expect(
      readFile(join(root, "data", "review", "sync-candidates.json"), "utf8"),
    ).resolves.toContain("《19》");
  });
});
