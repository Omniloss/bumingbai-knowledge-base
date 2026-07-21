import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { OfficialEpisodeSnapshot } from "../../src/sync/types.js";
import { loadPreviousSnapshot } from "../../tools/sync-official.js";

function snapshot(
  retrievedAt: string,
  title: string,
): OfficialEpisodeSnapshot[] {
  return [
    {
      number: 223,
      title,
      publishedAt: "2026-07-18T00:00:00.000Z",
      officialUrl: "https://bumingbai.net/episodes/ep-223/",
      guestNames: [],
      descriptionHtml: "<p>episode body</p>",
      sourceKind: "official_wordpress",
      retrievedAt,
      contentHash: "a".repeat(64),
    },
  ];
}

it("loads the latest previous official snapshot from a real temp root", async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), "bumingbai-sync-cli-"));
  const directory = join(root, "data", "raw", "official");
  const older = snapshot("2026-07-18T00:00:00.000Z", "old title");
  const latest = snapshot("2026-07-19T00:00:00.000Z", "latest title");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "2026-07-18T00-00-00.000Z-old.json"),
    `${JSON.stringify(older)}\n`,
    "utf8",
  );
  const latestPath = join(directory, "2026-07-19T00-00-00.000Z-latest.json");
  await writeFile(latestPath, `${JSON.stringify(latest)}\n`, "utf8");

  // When
  const result = await loadPreviousSnapshot(root);

  // Then
  expect(result).toEqual({
    path: latestPath,
    snapshot: latest,
  });
});

it("returns no previous snapshot when the raw directory is absent", async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), "bumingbai-sync-cli-empty-"));

  // When
  const result = await loadPreviousSnapshot(root);

  // Then
  expect(result).toBeUndefined();
});
