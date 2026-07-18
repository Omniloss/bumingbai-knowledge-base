import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TmdbClient } from "../../src/providers/tmdb.js";

const FixtureSchema = z.object({ movie: z.unknown(), tv: z.unknown() });
const fixtureUrl = new URL(
  "../fixtures/providers/tmdb-search.json",
  import.meta.url,
);

async function loadFixture() {
  return FixtureSchema.parse(JSON.parse(await readFile(fixtureUrl, "utf8")));
}

describe("TmdbClient", () => {
  it("uses Bearer authentication and filters movie candidates", async () => {
    const requests: Array<{ init?: RequestInit; url: URL }> = [];
    const fixture = await loadFixture();
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push(init === undefined ? { url } : { init, url });
      return Response.json(fixture.movie);
    };

    const result = await new TmdbClient("test-token", fetcher).lookup({
      workId: "work_attorney",
      title: "The Attorney",
      originalTitle: "The Attorney",
      creatorNames: [],
      year: 2013,
      originalLanguage: "ko",
      mediaType: "film",
    });

    expect(requests[0]?.url.pathname).toBe("/3/search/movie");
    expect(requests[0]?.url.searchParams.get("query")).toBe("The Attorney");
    expect(new Headers(requests[0]?.init?.headers).get("Authorization")).toBe(
      "Bearer test-token",
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      externalId: "123",
      originalTitle: "The Attorney",
      originalLanguage: "ko",
      posterPath: "/poster.jpg",
    });
  });

  it("uses the TV search endpoint for television candidates", async () => {
    const fixture = await loadFixture();
    let requestedPath = "";
    const fetcher: typeof fetch = async (input) => {
      requestedPath = new URL(input instanceof Request ? input.url : input)
        .pathname;
      return Response.json(fixture.tv);
    };

    const result = await new TmdbClient("test-token", fetcher).lookup({
      workId: "work_signal",
      title: "Signal",
      creatorNames: [],
      year: 2016,
      mediaType: "television",
    });

    expect(requestedPath).toBe("/3/search/tv");
    expect(result.records[0]).toMatchObject({
      externalId: "456",
      originalTitle: "Signal",
      originalLanguage: "ko",
      posterPath: "/signal.jpg",
    });
  });

  it("requires a token", () => {
    expect(() => new TmdbClient("")).toThrow("TMDB_API_TOKEN is required");
  });
});
