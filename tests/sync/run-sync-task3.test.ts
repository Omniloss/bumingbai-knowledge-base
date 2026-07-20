import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { EpisodeSchema } from "../../src/domain/schemas/entities.js";
import { runSync, writeHighRiskChanges } from "../../src/sync/run-sync.js";
import { writeSnapshot } from "../../src/sync/snapshot.js";
import {
  loadCatalogState,
  loadLatestOfficialSnapshot,
  writeCatalogState as persistCatalogState,
} from "../../src/sync/sync-state.js";
import type {
  OfficialEpisodeSnapshot,
  SyncChange,
} from "../../src/sync/types.js";

function snapshot(
  overrides: Partial<OfficialEpisodeSnapshot> = {},
): OfficialEpisodeSnapshot {
  return {
    number: 223,
    title: "原始标题",
    publishedAt: "2026-07-18T00:00:00.000Z",
    officialUrl: "https://bumingbai.net/episodes/ep-223/",
    guestNames: ["嘉宾"],
    descriptionHtml: "<h2>嘉宾推荐</h2><p>《作品》</p>",
    sourceKind: "official_wordpress",
    retrievedAt: "2026-07-18T00:00:00.000Z",
    contentHash: "a".repeat(64),
    ...overrides,
  };
}

describe("runSync", () => {
  it("persists high-risk changes and keeps source conflicts out of low-risk output", async () => {
    // Given
    const sourceChanges: SyncChange[] = [
      {
        episodeNumber: 223,
        field: "title",
        before: "WordPress title",
        after: "RSS title",
        risk: "high",
      },
    ];
    const writtenCandidates: unknown[] = [];
    const writtenChanges: SyncChange[][] = [];
    const writtenCatalogs: unknown[] = [];

    // When
    const result = await runSync({
      root: "unused",
      previousSnapshot: [snapshot()],
      currentSnapshot: [snapshot({ title: "更新标题" })],
      sourceChanges,
      loadCatalogState: async () => ({ episodes: [], people: [] }),
      synchronizeCatalog: async () => ({
        episodes: [],
        people: [],
        lowRiskChanges: [],
        highRiskChanges: [],
      }),
      writeCatalogState: async (_root, state) => {
        writtenCatalogs.push(state);
        return { episodesPath: "episodes.json", peoplePath: "people.json" };
      },
      writeSnapshot: async () => "snapshot.json",
      writeCandidateQueue: async (_root, candidates) => {
        writtenCandidates.push(...candidates);
        return "sync-candidates.json";
      },
      writeHighRiskChanges: async (_root, changes) => {
        writtenChanges.push(changes);
        return "sync-changes.json";
      },
    });

    // Then
    expect(result.snapshotPath).toBe("snapshot.json");
    expect(result.candidateQueuePath).toBe("sync-candidates.json");
    expect(result.syncChangesPath).toBe("sync-changes.json");
    expect(result.lowRiskChanges).toEqual([]);
    expect(result.highRiskChanges).toEqual(sourceChanges);
    expect(writtenCatalogs).toEqual([{ episodes: [], people: [] }]);
    expect(writtenChanges).toEqual([sourceChanges]);
    expect(writtenCandidates).toEqual([
      expect.objectContaining({
        episodeNumber: 223,
        rawText: "《作品》",
        risk: "high",
        status: "pending_verification",
      }),
    ]);
  });

  it("uses the catalog synchronizer result for low-risk normalized writes", async () => {
    // Given
    const lowRiskChange: SyncChange = {
      episodeNumber: 223,
      field: "title",
      before: "旧标题",
      after: "新标题",
      risk: "low",
    };
    const stateEpisode = EpisodeSchema.parse({
      id: "episode_123456789abc",
      slug: "ep-223",
      verificationStatus: "partially_verified",
      publicationStatus: "public",
      sources: [
        {
          kind: "official_episode",
          url: "https://bumingbai.net/episodes/ep-223/",
          retrievedAt: "2026-07-18T00:00:00.000Z",
        },
      ],
      number: 223,
      title: "旧标题",
      publishedAt: "2026-07-18T00:00:00.000Z",
      officialUrl: "https://bumingbai.net/episodes/ep-223/",
      guestIds: [],
      topicIds: [],
    });
    const state = { episodes: [stateEpisode], people: [] };
    const updatedState = {
      episodes: [{ ...stateEpisode, title: "新标题" }],
      people: [],
    };
    let persistedState: unknown;

    // When
    const result = await runSync({
      root: "unused",
      previousSnapshot: [snapshot()],
      currentSnapshot: [snapshot({ title: "新标题" })],
      loadCatalogState: async () => state,
      synchronizeCatalog: async () => ({
        ...updatedState,
        lowRiskChanges: [lowRiskChange],
        highRiskChanges: [],
      }),
      writeCatalogState: async (_root, nextState) => {
        persistedState = nextState;
        return { episodesPath: "episodes.json", peoplePath: "people.json" };
      },
      writeSnapshot: async () => "snapshot.json",
      writeCandidateQueue: async () => "sync-candidates.json",
      writeHighRiskChanges: async () => "sync-changes.json",
    });

    // Then
    expect(result.lowRiskChanges).toEqual([lowRiskChange]);
    expect(persistedState).toEqual(updatedState);
  });
  it("does not advance the snapshot baseline before catalog publication succeeds", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-sync-retry-"));
    const previous = snapshot({
      title: "Old title",
      guestNames: [],
      descriptionHtml: "",
      retrievedAt: "2026-07-18T00:00:00.000Z",
    });
    const current = snapshot({
      title: "New title",
      guestNames: [],
      descriptionHtml: "",
      retrievedAt: "2026-07-19T00:00:00.000Z",
    });
    const existing = EpisodeSchema.parse({
      id: "episode_123456789abc",
      slug: "ep-223",
      verificationStatus: "partially_verified",
      publicationStatus: "public",
      sources: [
        {
          kind: "official_episode",
          url: previous.officialUrl,
          retrievedAt: previous.retrievedAt,
        },
      ],
      number: 223,
      title: previous.title,
      publishedAt: previous.publishedAt,
      officialUrl: previous.officialUrl,
      guestIds: [],
      topicIds: [],
    });
    try {
      await persistCatalogState(root, { episodes: [existing], people: [] });
      await writeSnapshot(root, [previous]);

      await expect(
        runSync({
          root,
          currentSnapshot: [current],
          writeCatalogState: async () => {
            await delay(50);
            throw new Error("catalog write failed");
          },
        }),
      ).rejects.toThrow("catalog write failed");
      expect((await loadLatestOfficialSnapshot(root))?.snapshot).toEqual([
        previous,
      ]);

      await runSync({ root, currentSnapshot: [current] });

      expect((await loadLatestOfficialSnapshot(root))?.snapshot).toEqual([
        current,
      ]);
      expect((await loadCatalogState(root)).episodes[0]?.title).toBe(
        "New title",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("does not create an empty high-risk artifact until one must be cleared", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-sync-changes-"));
    const highRisk: SyncChange = {
      episodeNumber: 223,
      field: "episode",
      before: undefined,
      after: "episode_123456789abc",
      risk: "high",
    };
    try {
      const path = await writeHighRiskChanges(root, []);
      await expect(access(path)).rejects.toThrow();

      await writeHighRiskChanges(root, [highRisk]);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual([highRisk]);

      await writeHighRiskChanges(root, []);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
