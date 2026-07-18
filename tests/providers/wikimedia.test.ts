import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { WikimediaClient } from "../../src/providers/wikimedia.js";

const FixtureSchema = z.object({
  search: z.unknown(),
  entities: z.unknown(),
  commons: z.unknown(),
  commonsMissingCredit: z.unknown(),
});
const fixtureUrl = new URL(
  "../fixtures/providers/wikimedia-entity.json",
  import.meta.url,
);

async function loadFixture() {
  return FixtureSchema.parse(JSON.parse(await readFile(fixtureUrl, "utf8")));
}

describe("WikimediaClient", () => {
  it("retains per-file Commons attribution on image candidates", async () => {
    const fixture = await loadFixture();
    const requests: URL[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push(url);
      if (url.hostname === "commons.wikimedia.org") {
        return Response.json(fixture.commons);
      }
      if (url.searchParams.get("action") === "wbgetentities") {
        return Response.json(fixture.entities);
      }
      return Response.json(fixture.search);
    };

    const result = await new WikimediaClient(fetcher).lookup({
      workId: "work_speak_memory",
      title: "Speak, Memory",
      creatorNames: ["Vladimir Nabokov"],
      mediaType: "book",
    });

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
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.hostname === "commons.wikimedia.org") {
        return Response.json(fixture.commonsMissingCredit);
      }
      if (url.searchParams.get("action") === "wbgetentities") {
        return Response.json(fixture.entities);
      }
      return Response.json(fixture.search);
    };

    const result = await new WikimediaClient(fetcher).lookup({
      workId: "work_speak_memory",
      title: "Speak, Memory",
      creatorNames: ["Vladimir Nabokov"],
      mediaType: "book",
    });

    expect(result.records[0]?.image).toBeUndefined();
  });
});
