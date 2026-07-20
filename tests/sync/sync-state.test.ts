import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createStableId } from "../../src/domain/id.js";
import type { Episode, Person } from "../../src/domain/schemas/catalog.js";
import {
  loadCatalogState,
  loadLatestOfficialSnapshot,
  loadSyncState,
  writeCatalogState,
} from "../../src/sync/sync-state.js";
import type { OfficialEpisodeSnapshot } from "../../src/sync/types.js";

const source = {
  kind: "official_episode" as const,
  url: "https://bumingbai.net/episodes/1/",
  retrievedAt: "2026-07-19T00:00:00.000Z",
};
const episode: Episode = {
  id: createStableId("episode", "1"),
  slug: "ep-001",
  number: 1,
  title: "节目",
  publishedAt: "2026-07-19T00:00:00.000Z",
  officialUrl: source.url,
  guestIds: [],
  topicIds: [],
  verificationStatus: "partially_verified",
  publicationStatus: "public",
  sources: [source],
};
const person: Person = {
  id: createStableId("person", "嘉宾"),
  slug: `嘉宾-${createStableId("person", "嘉宾").slice(-6)}`,
  name: "嘉宾",
  aliases: [],
  roles: ["guest"],
  verificationStatus: "partially_verified",
  publicationStatus: "public",
  sources: [source],
};

function snapshot(retrievedAt: string): OfficialEpisodeSnapshot[] {
  return [
    {
      number: 1,
      title: "节目",
      publishedAt: "2026-07-19T00:00:00.000Z",
      officialUrl: source.url,
      guestNames: [],
      descriptionHtml: "",
      sourceKind: "official_wordpress",
      retrievedAt,
      contentHash: "a".repeat(64),
    },
  ];
}

describe("sync state", () => {
  it("loads the latest prior raw official snapshot and parses catalog schemas", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-sync-state-"));
    await mkdir(join(root, "data", "raw", "official"), { recursive: true });
    await mkdir(join(root, "data", "catalog"), { recursive: true });
    await writeFile(
      join(root, "data", "raw", "official", "older.json"),
      JSON.stringify(snapshot("2026-07-19T00:00:00.000Z")),
      "utf8",
    );
    const latestPath = join(root, "data", "raw", "official", "latest.json");
    await writeFile(
      latestPath,
      JSON.stringify(snapshot("2026-07-20T00:00:00.000Z")),
      "utf8",
    );
    await writeFile(
      join(root, "data", "catalog", "episodes.json"),
      JSON.stringify([episode]),
      "utf8",
    );
    await writeFile(
      join(root, "data", "catalog", "people.json"),
      JSON.stringify([person]),
      "utf8",
    );

    const latest = await loadLatestOfficialSnapshot(root);
    const state = await loadCatalogState(root);
    const combined = await loadSyncState(root);

    expect(latest).toEqual({
      path: latestPath,
      snapshot: snapshot("2026-07-20T00:00:00.000Z"),
    });
    expect(state).toEqual({ episodes: [episode], people: [person] });
    expect(combined.previousSnapshot).toEqual(latest);
    expect(combined.episodes).toEqual([episode]);
  });

  it("atomically writes normalized episode and people catalogs", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-sync-state-write-"));
    const paths = await writeCatalogState(root, {
      episodes: [episode],
      people: [person],
    });

    expect(JSON.parse(await readFile(paths.episodesPath, "utf8"))).toEqual([
      episode,
    ]);
    expect(JSON.parse(await readFile(paths.peoplePath, "utf8"))).toEqual([
      person,
    ]);
    expect(await readdir(join(root, "data", "catalog"))).toEqual(
      expect.arrayContaining(["episodes.json", "people.json"]),
    );
    expect(
      (await readdir(join(root, "data", "catalog"))).filter((name) =>
        name.endsWith(".tmp"),
      ),
    ).toEqual([]);
  });
  it("publishes people before episodes so guest references never lead", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-sync-state-order-"));
    const catalogDirectory = join(root, "data", "catalog");
    await mkdir(join(catalogDirectory, "episodes.json"), { recursive: true });

    await expect(
      writeCatalogState(root, { episodes: [episode], people: [person] }),
    ).rejects.toThrow();

    expect(
      JSON.parse(await readFile(join(catalogDirectory, "people.json"), "utf8")),
    ).toEqual([person]);
  });
});
