import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";

type EpisodeFixtureInput = {
  readonly id: string;
  readonly slug: string;
  readonly number: number | null;
  readonly publishedAt: string;
  readonly publicationStatus: "public" | "withheld";
};

type WorkFixtureInput = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly publicationStatus: "public" | "withheld";
};

function episodeFixture(input: EpisodeFixtureInput) {
  return {
    guestIds: [],
    id: input.id,
    number: input.number,
    officialUrl: `https://example.com/${input.slug}`,
    publicationStatus: input.publicationStatus,
    publishedAt: input.publishedAt,
    slug: input.slug,
    sources: [],
    title: input.slug,
    topicIds: [],
    verificationStatus: "verified",
  } as const;
}

function workFixture(input: WorkFixtureInput) {
  return {
    creatorIds: [],
    genres: [],
    id: input.id,
    mediaType: "book",
    publicationStatus: input.publicationStatus,
    regions: [],
    slug: input.slug,
    sources: [],
    title: input.title,
    topicIds: [],
    verificationStatus: "verified",
  } as const;
}

const CONTROLLED_EPISODES = [
  episodeFixture({
    id: "episode_000000000001",
    number: null,
    publicationStatus: "public",
    publishedAt: "2026-01-01T00:00:00.000Z",
    slug: "same-time-unnumbered",
  }),
  episodeFixture({
    id: "episode_000000000002",
    number: 2,
    publicationStatus: "public",
    publishedAt: "2025-12-01T00:00:00.000Z",
    slug: "older-episode",
  }),
  episodeFixture({
    id: "episode_000000000003",
    number: 3,
    publicationStatus: "public",
    publishedAt: "2026-01-01T00:00:00Z",
    slug: "same-time-number-3-zulu",
  }),
  episodeFixture({
    id: "episode_000000000004",
    number: 99,
    publicationStatus: "withheld",
    publishedAt: "2026-01-01T00:00:00.000Z",
    slug: "withheld-episode",
  }),
  episodeFixture({
    id: "episode_000000000005",
    number: null,
    publicationStatus: "public",
    publishedAt: "2026-02-01T00:00:00.000Z",
    slug: "newer-episode",
  }),
  episodeFixture({
    id: "episode_000000000006",
    number: 8,
    publicationStatus: "public",
    publishedAt: "2026-01-01T00:00:00Z",
    slug: "same-time-number-8",
  }),
  episodeFixture({
    id: "episode_000000000007",
    number: 3,
    publicationStatus: "public",
    publishedAt: "2026-01-01T00:00:00.000Z",
    slug: "same-time-number-3-alpha",
  }),
] as const;

const CONTROLLED_WORKS = [
  workFixture({
    id: "work_000000000001",
    publicationStatus: "public",
    slug: "sympathizer-zulu",
    title: "同情者",
  }),
  workFixture({
    id: "work_000000000002",
    publicationStatus: "public",
    slug: "dream-of-red-chamber",
    title: "红楼梦",
  }),
  workFixture({
    id: "work_000000000003",
    publicationStatus: "withheld",
    slug: "withheld-work",
    title: "阿房宫赋",
  }),
  workFixture({
    id: "work_000000000004",
    publicationStatus: "public",
    slug: "border-town",
    title: "边城",
  }),
  workFixture({
    id: "work_000000000005",
    publicationStatus: "public",
    slug: "sympathizer-alpha",
    title: "同情者",
  }),
  workFixture({
    id: "work_000000000006",
    publicationStatus: "public",
    slug: "a-q-true-story",
    title: "阿Q正传",
  }),
] as const;

const CONTROLLED_FILES: ReadonlyMap<string, string> = new Map([
  [
    "meta.json",
    JSON.stringify({
      generatedAt: "2026-07-15T00:00:00.000Z",
      schemaVersion: 1,
    }),
  ],
  ["episodes.json", JSON.stringify(CONTROLLED_EPISODES)],
  ["people.json", "[]"],
  ["topics.json", "[]"],
  ["works.json", JSON.stringify(CONTROLLED_WORKS)],
  ["editions.json", "[]"],
  ["recommendation-evidence.json", "[]"],
  ["image-assets.json", "[]"],
  ["work-relations.json", "[]"],
  ["provider-records.json", "[]"],
  ["issues.json", "[]"],
]);

class MissingFixtureFileError extends Error {
  constructor(readonly fileName: string) {
    super(`No controlled catalog fixture for ${fileName}`);
    this.name = "MissingFixtureFileError";
  }
}

export function installControlledCatalogBoundary(): void {
  vi.doMock("node:fs/promises", () => ({
    readFile: (url: URL): Promise<string> => {
      const fileName = basename(fileURLToPath(url));
      const contents = CONTROLLED_FILES.get(fileName);
      return contents === undefined
        ? Promise.reject(new MissingFixtureFileError(fileName))
        : Promise.resolve(contents);
    },
  }));
}
