import { describe, expect, it } from "vitest";
import { createStableId } from "../../src/domain/id.js";
import type { Episode, Person } from "../../src/domain/schemas/catalog.js";
import { synchronizeCatalog } from "../../src/sync/catalog-sync.js";
import type {
  OfficialEpisodeSnapshot,
  SyncChange,
} from "../../src/sync/types.js";

const retrievedAt = "2026-07-20T00:00:00.000Z";
const episodeSource = {
  kind: "official_episode" as const,
  url: "https://bumingbai.net/episodes/1/",
  retrievedAt: "2026-07-19T00:00:00.000Z",
  locator: "legacy",
};
const knownPerson: Person = {
  id: createStableId("person", "known guest"),
  slug: `known-guest-${createStableId("person", "known guest").slice(-6)}`,
  name: "known guest",
  aliases: [],
  roles: ["guest"],
  verificationStatus: "partially_verified",
  publicationStatus: "public",
  sources: [episodeSource],
};
const existingEpisode: Episode = {
  id: createStableId("episode", "1"),
  slug: "ep-001",
  number: 1,
  title: "old title",
  publishedAt: "2026-07-19T00:00:00.000Z",
  duration: "00:10:00",
  officialUrl: episodeSource.url,
  transcriptUrl: "https://bumingbai.net/transcripts/1/",
  guestIds: [knownPerson.id],
  topicIds: [],
  verificationStatus: "partially_verified",
  publicationStatus: "public",
  sources: [episodeSource],
};

function snapshot(
  overrides: Partial<OfficialEpisodeSnapshot> = {},
): OfficialEpisodeSnapshot {
  return {
    number: 1,
    title: "new title",
    publishedAt: "2026-07-20T00:00:00.000Z",
    duration: "00:20:00",
    officialUrl: episodeSource.url,
    transcriptUrl: "https://bumingbai.net/transcripts/2/",
    guestNames: ["known guest", "new guest"],
    descriptionHtml: "",
    sourceKind: "official_wordpress",
    retrievedAt,
    contentHash: "a".repeat(64),
    ...overrides,
  };
}

describe("synchronizeCatalog", () => {
  it("applies low-risk fields, resolves guests, and preserves sources", () => {
    const result = synchronizeCatalog({
      catalog: { episodes: [existingEpisode], people: [knownPerson] },
      previousSnapshot: [
        snapshot({
          title: "old title",
          duration: "00:10:00",
          transcriptUrl: "https://bumingbai.net/transcripts/1/",
          guestNames: ["known guest"],
        }),
      ],
      currentSnapshot: [snapshot()],
    });

    expect(result.episodes[0]).toMatchObject({
      id: existingEpisode.id,
      title: "new title",
      duration: "00:20:00",
      transcriptUrl: "https://bumingbai.net/transcripts/2/",
      guestIds: [knownPerson.id, createStableId("person", "new guest")],
    });
    expect(result.episodes[0]?.sources).toEqual(existingEpisode.sources);
    expect(result.people.map((person) => person.name)).toEqual([
      "known guest",
      "new guest",
    ]);
    expect(result.lowRiskChanges.map((change) => change.field)).toEqual(
      expect.arrayContaining(["title", "duration", "transcriptUrl"]),
    );
    expect(result.highRiskChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "person", risk: "high" }),
      ]),
    );
  });

  it("does not apply source-conflicted fields and reports source-kind changes", () => {
    const sourceChanges: SyncChange[] = [
      {
        episodeNumber: 1,
        field: "title",
        before: "WordPress title",
        after: "RSS title",
        risk: "high",
      },
    ];
    const result = synchronizeCatalog({
      catalog: { episodes: [existingEpisode], people: [knownPerson] },
      previousSnapshot: [
        snapshot({ title: "old title", sourceKind: "official_wordpress" }),
      ],
      currentSnapshot: [snapshot({ sourceKind: "official_rss" })],
      sourceChanges,
    });

    expect(result.episodes[0]?.title).toBe("old title");
    expect(result.highRiskChanges).toEqual(
      expect.arrayContaining([
        sourceChanges[0],
        expect.objectContaining({ field: "sourceKind", risk: "high" }),
      ]),
    );
    expect(result.lowRiskChanges.map((change) => change.field)).not.toContain(
      "title",
    );
  });

  it("does not overwrite curated episodes without a previous official snapshot", () => {
    const newEpisode = snapshot({
      number: 2,
      title: "episode two",
      officialUrl: "https://bumingbai.net/episodes/2/",
      guestNames: [],
    });
    const result = synchronizeCatalog({
      catalog: { episodes: [existingEpisode], people: [knownPerson] },
      currentSnapshot: [snapshot(), newEpisode],
    });

    expect(result.episodes.find((episode) => episode.number === 1)).toEqual(
      existingEpisode,
    );
    expect(result.lowRiskChanges).toEqual([]);
    expect(
      result.episodes.find((episode) => episode.number === 2),
    ).toMatchObject({
      number: 2,
      title: "episode two",
    });
  });

  it("preserves curated fields that diverged from the previous official snapshot", () => {
    const result = synchronizeCatalog({
      catalog: { episodes: [existingEpisode], people: [knownPerson] },
      previousSnapshot: [
        snapshot({
          title: "official old title",
          duration: "00:10:00",
          officialUrl: "https://bumingbai.net/episodes/official-1/",
          transcriptUrl: "https://bumingbai.net/transcripts/1/",
          guestNames: [],
        }),
      ],
      currentSnapshot: [
        snapshot({
          title: "official new title",
          duration: "00:30:00",
          officialUrl: "https://bumingbai.net/episodes/official-2/",
          transcriptUrl: "https://bumingbai.net/transcripts/3/",
          guestNames: ["new guest"],
        }),
      ],
    });

    expect(result.episodes[0]).toMatchObject({
      title: existingEpisode.title,
      duration: "00:30:00",
      officialUrl: existingEpisode.officialUrl,
      transcriptUrl: "https://bumingbai.net/transcripts/3/",
      guestIds: existingEpisode.guestIds,
    });
    expect(result.highRiskChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "title", risk: "high" }),
        expect.objectContaining({ field: "officialUrl", risk: "high" }),
        expect.objectContaining({ field: "guestNames", risk: "high" }),
      ]),
    );
    expect(result.people).toEqual([knownPerson]);
  });

  it("materializes new episodes with migration-compatible identity and high risk", () => {
    const current = snapshot({
      number: 223,
      title: "episode 223",
      officialUrl: "https://bumingbai.net/episodes/223/",
      guestNames: [],
    });
    const result = synchronizeCatalog({
      catalog: { episodes: [], people: [] },
      currentSnapshot: [current],
    });

    expect(result.episodes[0]).toMatchObject({
      id: createStableId("episode", "223"),
      slug: "ep-223",
      number: 223,
      title: current.title,
    });
    expect(result.materializedEpisodes).toHaveLength(1);
    expect(result.highRiskChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          episodeNumber: 223,
          field: "episode",
          risk: "high",
        }),
      ]),
    );
  });
  it("does not materialize guests from a source conflict", () => {
    const result = synchronizeCatalog({
      catalog: { episodes: [existingEpisode], people: [knownPerson] },
      previousSnapshot: [snapshot({ guestNames: [knownPerson.name] })],
      currentSnapshot: [
        snapshot({ guestNames: [knownPerson.name, "untrusted guest"] }),
      ],
      sourceChanges: [
        {
          episodeNumber: 1,
          field: "guestNames",
          before: [knownPerson.name],
          after: [knownPerson.name, "untrusted guest"],
          risk: "high",
        },
      ],
    });

    expect(result.episodes[0]?.guestIds).toEqual(existingEpisode.guestIds);
    expect(result.materializedPeople).toEqual([]);
    expect(result.people).toEqual([knownPerson]);
  });

  it("clears optional metadata when the official source removes it", () => {
    const current = snapshot({ guestNames: [knownPerson.name] });
    delete current.duration;
    delete current.transcriptUrl;
    const result = synchronizeCatalog({
      catalog: { episodes: [existingEpisode], people: [knownPerson] },
      previousSnapshot: [
        snapshot({
          duration: "00:10:00",
          transcriptUrl: "https://bumingbai.net/transcripts/1/",
          guestNames: [knownPerson.name],
        }),
      ],
      currentSnapshot: [current],
    });

    expect(result.episodes[0]?.duration).toBeUndefined();
    expect(result.episodes[0]?.transcriptUrl).toBeUndefined();
  });
});
