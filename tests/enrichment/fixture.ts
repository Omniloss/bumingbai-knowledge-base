import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { CatalogSchema } from "../../src/domain/schemas/catalog.js";

export const now = "2026-07-18T00:00:00.000Z";
export const source = {
  kind: "official_episode" as const,
  url: "https://example.com/episode",
  retrievedAt: now,
};
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

export async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "enrichment-test-"));
  temporaryRoots.push(root);
  return root;
}

export function catalogFixture() {
  const episode = (id: string, slug: string, number: number) => ({
    id,
    slug,
    number,
    title: `Episode ${number}`,
    publishedAt: now,
    officialUrl: `https://example.com/${slug}`,
    guestIds: [],
    topicIds: [],
    verificationStatus: "verified" as const,
    publicationStatus: "public" as const,
    sources: [source],
  });
  const workBase = {
    mediaType: "book" as const,
    verificationStatus: "verified" as const,
    publicationStatus: "public" as const,
    sources: [source],
  };
  return CatalogSchema.parse({
    schemaVersion: 1,
    generatedAt: now,
    episodes: [
      episode("episode_000000000001", "episode-one", 1),
      episode("episode_000000000002", "episode-two", 2),
      episode("episode_000000000003", "episode-three", 3),
    ],
    people: [
      {
        id: "person_000000000001",
        slug: "author-one",
        name: "Author One",
        aliases: [],
        roles: ["author"],
        verificationStatus: "verified",
        publicationStatus: "public",
        sources: [source],
      },
      {
        id: "person_000000000002",
        slug: "author-two",
        name: "Author Two",
        aliases: [],
        roles: ["author"],
        verificationStatus: "verified",
        publicationStatus: "public",
        sources: [source],
      },
    ],
    topics: [
      {
        id: "topic_000000000001",
        slug: "memory",
        name: "Memory",
        description: "Memory",
        aliases: [],
        verificationStatus: "verified",
        publicationStatus: "public",
        sources: [source],
      },
    ],
    works: [
      {
        ...workBase,
        id: "work_000000000001",
        slug: "first-work",
        title: "First Work",
        originalTitle: "First Work",
        creatorIds: ["person_000000000001"],
        year: 2001,
        topicIds: ["topic_000000000001"],
        genres: ["memoir"],
        regions: ["US"],
      },
      {
        ...workBase,
        id: "work_000000000002",
        slug: "second-work",
        title: "Second Work",
        creatorIds: ["person_000000000001"],
        year: 2004,
        topicIds: [],
        genres: [],
        regions: ["US"],
      },
      {
        ...workBase,
        id: "work_000000000003",
        slug: "third-work",
        title: "Third Work",
        creatorIds: ["person_000000000002"],
        year: 2008,
        topicIds: ["topic_000000000001"],
        genres: ["memoir"],
        regions: ["US"],
      },
    ],
    editions: [],
    recommendationEvidence: [1, 2, 3].map((number) => ({
      id: `evidence_00000000000${number}`,
      episodeId: `episode_00000000000${number}`,
      workId: `work_00000000000${number}`,
      rawText: `Work ${number}`,
      source,
      verificationStatus: "verified",
      publicationStatus: "public",
    })),
    imageAssets: [],
    workRelations: [],
    providerRecords: [],
    reviewIssues: [],
  });
}
