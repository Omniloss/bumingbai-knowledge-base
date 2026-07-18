import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { TmdbClient } from "../../src/providers/tmdb.js";

const FixtureSchema = z.object({
  movie: z.unknown(),
  tv: z.unknown(),
  malformedMovie: z.unknown(),
  malformedTv: z.unknown(),
});
const fixtureUrl = new URL(
  "../fixtures/providers/tmdb-search.json",
  import.meta.url,
);
const errorFixtureUrl = new URL(
  "../fixtures/providers/provider-error.json",
  import.meta.url,
);
const ErrorFixtureSchema = z.object({ body: z.string() });

const movieQuery = {
  workId: "work_attorney",
  title: "변호인",
  originalTitle: "The Attorney",
  creatorNames: [],
  year: 2013,
  originalLanguage: "ko",
  mediaType: "film" as const,
};
const televisionQuery = {
  workId: "work_signal",
  title: "시그널",
  originalTitle: "Signal",
  creatorNames: [],
  year: 2016,
  mediaType: "television" as const,
};

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

    const result = await new TmdbClient("test-token", fetcher).lookup(
      movieQuery,
    );

    expect(requests[0]?.url.pathname).toBe("/3/search/movie");
    expect(requests[0]?.url.searchParams.get("query")).toBe("The Attorney");
    expect(new Headers(requests[0]?.init?.headers).get("Authorization")).toBe(
      "Bearer test-token",
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      externalId: "123",
      title: "변호인",
      originalTitle: "The Attorney",
      originalLanguage: "ko",
      posterPath: "/poster.jpg",
    });
  });

  it("uses original TV names and filters an explicitly supplied language", async () => {
    const fixture = await loadFixture();
    let requestedPath = "";
    const fetcher: typeof fetch = async (input) => {
      requestedPath = new URL(input instanceof Request ? input.url : input)
        .pathname;
      return Response.json(fixture.tv);
    };

    const result = await new TmdbClient("test-token", fetcher).lookup({
      ...televisionQuery,
      originalLanguage: "ko",
    });

    expect(requestedPath).toBe("/3/search/tv");
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      externalId: "456",
      title: "시그널",
      originalTitle: "Signal",
      originalLanguage: "ko",
      posterPath: "/signal.jpg",
    });
  });

  it("deliberately keeps all original languages when none is supplied", async () => {
    const fixture = await loadFixture();
    const fetcher: typeof fetch = async () => Response.json(fixture.tv);

    const result = await new TmdbClient("test-token", fetcher).lookup(
      televisionQuery,
    );

    expect(result.records.map((record) => record.externalId)).toEqual([
      "456",
      "458",
    ]);
  });

  it("normalizes original-title matches without consulting the runtime locale", async () => {
    const fixture = await loadFixture();
    const localeLowerCase = vi
      .spyOn(String.prototype, "toLocaleLowerCase")
      .mockReturnValue("locale-dependent");
    const fetcher: typeof fetch = async () => Response.json(fixture.movie);

    try {
      const result = await new TmdbClient("test-token", fetcher).lookup(
        movieQuery,
      );
      expect(result.records.map((record) => record.externalId)).toEqual([
        "123",
      ]);
    } finally {
      localeLowerCase.mockRestore();
    }
  });

  it.each([
    ["movie", "malformedMovie", movieQuery],
    ["tv", "malformedTv", televisionQuery],
  ] as const)("rejects malformed %s response data", async (_, fixtureKey, query) => {
    const fixture = await loadFixture();
    const fetcher: typeof fetch = async () =>
      Response.json(fixture[fixtureKey]);

    await expect(
      new TmdbClient("test-token", fetcher).lookup(query),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it("reports only provider and status for non-2xx responses", async () => {
    const errorFixture = ErrorFixtureSchema.parse(
      JSON.parse(await readFile(errorFixtureUrl, "utf8")),
    );
    const fetcher: typeof fetch = async () =>
      new Response(errorFixture.body, { status: 401 });

    const error = await new TmdbClient("super-secret-token", fetcher)
      .lookup(movieQuery)
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected provider error");
    expect(error.message).toBe("TMDB request failed: 401");
    expect(error.message).not.toContain("super-secret-token");
    expect(error.message).not.toContain("response-private-material");
    expect(error.message).not.toContain("Authorization");
  });

  it("requires a token", () => {
    expect(() => new TmdbClient("")).toThrow("TMDB_API_TOKEN is required");
  });
});
