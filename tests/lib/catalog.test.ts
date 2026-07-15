import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  getEpisodeBySlug,
  getWorkBySlug,
  listPublicEpisodes,
  listPublicWorks,
  loadCatalog,
} from "../../src/lib/catalog.js";

describe.sequential("CatalogRepository", () => {
  it("loads the normalized baseline outside the caller working directory", async () => {
    // Given
    const originalWorkingDirectory = process.cwd();

    try {
      process.chdir(tmpdir());

      // When
      const catalog = await loadCatalog();

      // Then
      expect(catalog.episodes).toHaveLength(237);
      expect(catalog.recommendationEvidence).toHaveLength(423);
    } finally {
      process.chdir(originalWorkingDirectory);
    }
  });

  it("reuses the cached catalog promise", () => {
    // Given
    const firstLoad = loadCatalog();

    // When
    const secondLoad = loadCatalog();

    // Then
    expect(secondLoad).toBe(firstLoad);
  });

  it("returns only public episodes", async () => {
    // Given
    const expectedCount = 237;

    // When
    const episodes = await listPublicEpisodes();

    // Then
    expect(episodes).toHaveLength(expectedCount);
    expect(
      episodes.every((episode) => episode.publicationStatus === "public"),
    ).toBe(true);
  });

  it("keeps a real unnumbered episode in the public episode list", async () => {
    // Given
    const unnumberedSlug = "special-a8b6ad";

    // When
    const episode = (await listPublicEpisodes()).find(
      (item) => item.slug === unnumberedSlug,
    );

    // Then
    expect(episode).toMatchObject({ number: null, slug: unnumberedSlug });
  });

  it("orders public episodes by date, number, and slug", async () => {
    // Given
    const episodes = await listPublicEpisodes();
    const expected = episodes.toSorted((left, right) => {
      const dateOrder =
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
      if (dateOrder !== 0) {
        return dateOrder;
      }
      if (left.number === null && right.number !== null) {
        return 1;
      }
      if (left.number !== null && right.number === null) {
        return -1;
      }
      if (left.number !== null && right.number !== null) {
        const numberOrder = right.number - left.number;
        if (numberOrder !== 0) {
          return numberOrder;
        }
      }
      return left.slug < right.slug ? -1 : Number(left.slug > right.slug);
    });

    // When
    const orderedSlugs = episodes.map((episode) => episode.slug);

    // Then
    expect(orderedSlugs).toEqual(expected.map((episode) => episode.slug));
  });

  it("excludes withheld works from the public work list", async () => {
    // Given
    const withheldSlug = "conclave-2af976";

    // When
    const works = await listPublicWorks();

    // Then
    expect(works).toHaveLength(387);
    expect(works.every((work) => work.publicationStatus === "public")).toBe(
      true,
    );
    expect(works.some((work) => work.slug === withheldSlug)).toBe(false);
  });

  it("orders public works by Chinese title with a stable slug tie-breaker", async () => {
    // Given
    const tiedTitle = "同情者";
    const works = await listPublicWorks();
    const expected = works.toSorted((left, right) => {
      const titleOrder = left.title.localeCompare(right.title, "zh-CN");
      return (
        titleOrder ||
        (left.slug < right.slug ? -1 : Number(left.slug > right.slug))
      );
    });

    // When
    const orderedSlugs = works.map((work) => work.slug);
    const tiedSlugs = works
      .filter((work) => work.title === tiedTitle)
      .map((work) => work.slug);

    // Then
    expect(orderedSlugs).toEqual(expected.map((work) => work.slug));
    expect(tiedSlugs).toEqual(["同情者-e9612d", "同情者-eb28e6"]);
  });

  it("finds an episode by slug", async () => {
    // Given
    const slug = "special-a8b6ad";
    const expected = (await listPublicEpisodes()).find(
      (episode) => episode.slug === slug,
    );

    // When
    const episode = await getEpisodeBySlug(slug);

    // Then
    expect(expected).toBeDefined();
    expect(episode).toEqual(expected);
  });

  it("returns undefined when an episode slug is missing", async () => {
    // Given
    const missingSlug = "missing-episode";

    // When
    const episode = await getEpisodeBySlug(missingSlug);

    // Then
    expect(episode).toBeUndefined();
  });

  it("finds a work by slug", async () => {
    // Given
    const slug = "同情者-eb28e6";
    const expected = (await listPublicWorks()).find(
      (work) => work.slug === slug,
    );

    // When
    const work = await getWorkBySlug(slug);

    // Then
    expect(expected).toBeDefined();
    expect(work).toEqual(expected);
  });

  it("returns undefined when a work slug is missing", async () => {
    // Given
    const missingSlug = "missing-work";

    // When
    const work = await getWorkBySlug(missingSlug);

    // Then
    expect(work).toBeUndefined();
  });
});
