import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { WikimediaClient } from "../../src/providers/wikimedia.js";

const FixtureSchema = z.object({
  search: z.unknown(),
  entities: z.unknown(),
  commons: z.unknown(),
  commonsMissingCredit: z.unknown(),
  malformedSearch: z.unknown(),
  malformedEntities: z.unknown(),
  malformedCommons: z.unknown(),
});
const fixtureUrl = new URL(
  "../fixtures/providers/wikimedia-entity.json",
  import.meta.url,
);
const errorFixtureUrl = new URL(
  "../fixtures/providers/provider-error.json",
  import.meta.url,
);
const ErrorFixtureSchema = z.object({ body: z.string() });

type StagedResponses = {
  search: unknown;
  entities: unknown;
  commons: unknown;
  failure?: {
    stage: "search" | "entities" | "commons";
    status: number;
    body: string;
  };
};

function createFetcher(
  responses: StagedResponses,
  requests: URL[] = [],
): typeof fetch {
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    requests.push(url);
    const stage =
      url.hostname === "commons.wikimedia.org"
        ? "commons"
        : url.searchParams.get("action") === "wbgetentities"
          ? "entities"
          : "search";
    if (responses.failure?.stage === stage) {
      return new Response(responses.failure.body, {
        status: responses.failure.status,
      });
    }
    return Response.json(responses[stage]);
  };
}

const query = {
  workId: "work_speak_memory",
  title: "Speak, Memory",
  creatorNames: ["Vladimir Nabokov"],
  mediaType: "book" as const,
};

async function loadFixture() {
  return FixtureSchema.parse(JSON.parse(await readFile(fixtureUrl, "utf8")));
}

describe("WikimediaClient", () => {
  it("retains per-file Commons attribution on image candidates", async () => {
    const fixture = await loadFixture();
    const requests: URL[] = [];
    const fetcher = createFetcher(
      {
        search: fixture.search,
        entities: fixture.entities,
        commons: fixture.commons,
      },
      requests,
    );

    const result = await new WikimediaClient(fetcher).lookup(query);

    expect(requests.map((url) => url.searchParams.get("action"))).toEqual([
      "wbsearchentities",
      "wbgetentities",
      "query",
    ]);
    const commonsRequest = requests[2];
    expect(commonsRequest?.searchParams.get("iiprop")).toBe("url|extmetadata");
    expect(commonsRequest?.searchParams.get("iiextmetadatafilter")).toBe(
      "LicenseShortName|Artist|Credit",
    );
    expect(commonsRequest?.searchParams.get("titles")).toBe(
      "File:Speak Memory first edition.jpg",
    );
    expect(result.provider).toBe("wikidata");
    expect(result.records[0]).toMatchObject({
      externalId: "Q1514127",
      license: "CC0",
      externalIds: { P648: ["OL45804W"] },
    });
    expect(result.records[0]?.image).toMatchObject({
      sourcePageUrl: expect.stringContaining("commons.wikimedia.org"),
      license: "CC BY-SA 4.0",
      artist: "Example Archive",
      credit: "Example Archive collection",
      attribution: expect.any(String),
    });
  });

  it("omits an image candidate when required Commons credit is absent", async () => {
    const fixture = await loadFixture();
    const fetcher = createFetcher({
      search: fixture.search,
      entities: fixture.entities,
      commons: fixture.commonsMissingCredit,
    });

    const result = await new WikimediaClient(fetcher).lookup(query);

    expect(result.records[0]?.image).toBeUndefined();
  });

  it.each([
    ["search", "malformedSearch"],
    ["entities", "malformedEntities"],
    ["commons", "malformedCommons"],
  ] as const)("rejects malformed %s response data", async (stage, fixtureKey) => {
    const fixture = await loadFixture();
    const fetcher = createFetcher({
      search: stage === "search" ? fixture[fixtureKey] : fixture.search,
      entities: stage === "entities" ? fixture[fixtureKey] : fixture.entities,
      commons: stage === "commons" ? fixture[fixtureKey] : fixture.commons,
    });

    await expect(
      new WikimediaClient(fetcher).lookup(query),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it.each([
    ["search", 503],
    ["entities", 502],
    ["commons", 429],
  ] as const)("reports only provider and status for a non-2xx %s response", async (stage, status) => {
    const fixture = await loadFixture();
    const errorFixture = ErrorFixtureSchema.parse(
      JSON.parse(await readFile(errorFixtureUrl, "utf8")),
    );
    const fetcher = createFetcher({
      search: fixture.search,
      entities: fixture.entities,
      commons: fixture.commons,
      failure: { stage, status, body: errorFixture.body },
    });

    const error = await new WikimediaClient(fetcher).lookup(query).then(
      () => undefined,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected provider error");
    expect(error.message).toBe(`Wikimedia request failed: ${status}`);
    expect(error.message).not.toContain("super-secret-token");
    expect(error.message).not.toContain("response-private-material");
    expect(error.message).not.toContain("Authorization");
  });
});
