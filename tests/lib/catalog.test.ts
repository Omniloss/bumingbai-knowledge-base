import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installControlledCatalogBoundary } from "./catalog-fixture.js";

function importCatalogRepository() {
  return import("../../src/lib/catalog.js");
}

afterEach(() => {
  vi.doUnmock("node:fs/promises");
  vi.resetModules();
});

describe.sequential("CatalogRepository", () => {
  it("discovers the catalog root from an Astro prerender chunk location", async () => {
    // Given
    const { findCatalogRoot } = await importCatalogRepository();
    const prerenderModuleUrl = new URL(
      "../../dist/.prerender/chunks/catalog.mjs",
      import.meta.url,
    );

    // When
    const catalogRoot = findCatalogRoot(prerenderModuleUrl);

    // Then
    expect(catalogRoot.href).toBe(new URL("../../", import.meta.url).href);
  });

  it("reports a typed error when no catalog sentinel is reachable", async () => {
    // Given
    const { CatalogRootNotFoundError, findCatalogRoot } =
      await importCatalogRepository();
    const startUrl = pathToFileURL(
      join(tmpdir(), "missing-catalog-root", "catalog.mjs"),
    );

    // When
    let actualError: unknown;
    try {
      findCatalogRoot(startUrl);
    } catch (error) {
      actualError = error;
    }

    // Then
    expect(actualError).toBeInstanceOf(CatalogRootNotFoundError);
    if (!(actualError instanceof CatalogRootNotFoundError)) throw actualError;
    expect(actualError.startUrl).toBe(startUrl);
    expect(actualError.sentinelRelativePath).toBe("data/catalog/meta.json");
  });

  it("loads the normalized baseline outside the caller working directory", async () => {
    // Given
    const originalWorkingDirectory = process.cwd();
    process.chdir(tmpdir());

    try {
      vi.resetModules();

      // When
      const { loadCatalog } = await importCatalogRepository();
      const catalog = await loadCatalog();

      // Then
      expect(catalog.episodes).toHaveLength(237);
      expect(catalog.recommendationEvidence).toHaveLength(423);
    } finally {
      process.chdir(originalWorkingDirectory);
    }
  });

  it("reuses the cached catalog promise", async () => {
    // Given
    const { loadCatalog } = await importCatalogRepository();
    const firstLoad = loadCatalog();

    // When
    const secondLoad = loadCatalog();

    // Then
    expect(secondLoad).toBe(firstLoad);
    await expect(firstLoad).resolves.toMatchObject({ schemaVersion: 1 });
  });

  it("excludes withheld episodes at a controlled file boundary", async () => {
    // Given
    installControlledCatalogBoundary();
    const { listPublicEpisodes } = await importCatalogRepository();

    // When
    const episodes = await listPublicEpisodes();

    // Then
    expect(episodes).toHaveLength(6);
    expect(episodes.map((episode) => episode.slug)).not.toContain(
      "withheld-episode",
    );
    expect(
      episodes.every((episode) => episode.publicationStatus === "public"),
    ).toBe(true);
  });

  it("orders equal-time episodes by number, null, and slug", async () => {
    // Given
    installControlledCatalogBoundary();
    const { listPublicEpisodes } = await importCatalogRepository();

    // When
    const slugs = (await listPublicEpisodes()).map((episode) => episode.slug);

    // Then
    expect(slugs).toEqual([
      "newer-episode",
      "same-time-number-8",
      "same-time-number-3-alpha",
      "same-time-number-3-zulu",
      "same-time-unnumbered",
      "older-episode",
    ]);
  });

  it("keeps a real unnumbered episode in the public episode list", async () => {
    // Given
    const unnumberedSlug = "special-a8b6ad";
    const { listPublicEpisodes } = await importCatalogRepository();

    // When
    const episode = (await listPublicEpisodes()).find(
      (item) => item.slug === unnumberedSlug,
    );

    // Then
    expect(episode).toMatchObject({ number: null, slug: unnumberedSlug });
  });

  it("excludes withheld works at a controlled file boundary", async () => {
    // Given
    installControlledCatalogBoundary();
    const { listPublicWorks } = await importCatalogRepository();

    // When
    const works = await listPublicWorks();

    // Then
    expect(works).toHaveLength(5);
    expect(works.map((work) => work.slug)).not.toContain("withheld-work");
    expect(works.every((work) => work.publicationStatus === "public")).toBe(
      true,
    );
  });

  it("orders explicit Chinese titles and same-title slugs", async () => {
    // Given
    installControlledCatalogBoundary();
    const { listPublicWorks } = await importCatalogRepository();

    // When
    const slugs = (await listPublicWorks()).map((work) => work.slug);

    // Then
    expect(slugs).toEqual([
      "a-q-true-story",
      "border-town",
      "dream-of-red-chamber",
      "sympathizer-alpha",
      "sympathizer-zulu",
    ]);
  });

  it("finds an episode by slug", async () => {
    // Given
    const slug = "special-a8b6ad";
    const { getEpisodeBySlug, listPublicEpisodes } =
      await importCatalogRepository();
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
    const { getEpisodeBySlug } = await importCatalogRepository();

    // When
    const episode = await getEpisodeBySlug("missing-episode");

    // Then
    expect(episode).toBeUndefined();
  });

  it("finds a work by slug", async () => {
    // Given
    const slug = "同情者-eb28e6";
    const { getWorkBySlug, listPublicWorks } = await importCatalogRepository();
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
    const { getWorkBySlug } = await importCatalogRepository();

    // When
    const work = await getWorkBySlug("missing-work");

    // Then
    expect(work).toBeUndefined();
  });
});
