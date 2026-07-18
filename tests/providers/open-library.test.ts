import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { OpenLibraryClient } from "../../src/providers/open-library.js";

const fixtureUrl = new URL(
  "../fixtures/providers/open-library-search.json",
  import.meta.url,
);
const malformedFixtureUrl = new URL(
  "../fixtures/providers/open-library-malformed.json",
  import.meta.url,
);
const errorFixtureUrl = new URL(
  "../fixtures/providers/provider-error.json",
  import.meta.url,
);
const ErrorFixtureSchema = z.object({ body: z.string() });

const query = {
  workId: "work_speak_memory",
  title: "  SPEAK,   MEMORY ",
  creatorNames: ["Vladimir Nabokov"],
  year: 1966,
  mediaType: "book" as const,
};

describe("OpenLibraryClient", () => {
  it("returns only exact normalized title and author candidates", async () => {
    const requests: URL[] = [];
    const fetcher: typeof fetch = async (input) => {
      requests.push(new URL(input instanceof Request ? input.url : input));
      return new Response(await readFile(fixtureUrl, "utf8"), { status: 200 });
    };

    const result = await new OpenLibraryClient(fetcher).lookup(query);

    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (request === undefined)
      throw new Error("Expected one Open Library request");
    expect(request.origin + request.pathname).toBe(
      "https://openlibrary.org/search.json",
    );
    expect(request.searchParams.get("title")).toBe("SPEAK,   MEMORY");
    expect(request.searchParams.get("author")).toBe("Vladimir Nabokov");
    expect(request.searchParams.get("limit")).toBe("5");
    expect(result.provider).toBe("open_library");
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      externalId: "OL45804W",
      title: "Speak, Memory",
      cover: {
        handling: "hotlink_only",
        url: "https://covers.openlibrary.org/b/id/126481-L.jpg?default=false",
      },
    });
  });

  it("normalizes matches without consulting the runtime locale", async () => {
    const localeLowerCase = vi
      .spyOn(String.prototype, "toLocaleLowerCase")
      .mockReturnValue("locale-dependent");
    const fetcher: typeof fetch = async () =>
      new Response(await readFile(fixtureUrl, "utf8"), { status: 200 });

    try {
      const result = await new OpenLibraryClient(fetcher).lookup(query);
      expect(result.records.map((record) => record.externalId)).toEqual([
        "OL45804W",
      ]);
    } finally {
      localeLowerCase.mockRestore();
    }
  });

  it("rejects malformed Open Library response data", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(await readFile(malformedFixtureUrl, "utf8"), {
        status: 200,
      });

    await expect(
      new OpenLibraryClient(fetcher).lookup(query),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it("reports only provider and status for non-2xx responses", async () => {
    const errorFixture = ErrorFixtureSchema.parse(
      JSON.parse(await readFile(errorFixtureUrl, "utf8")),
    );
    const fetcher: typeof fetch = async () =>
      new Response(errorFixture.body, { status: 503 });

    const error = await new OpenLibraryClient(fetcher).lookup(query).then(
      () => undefined,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected provider error");
    expect(error.message).toBe("Open Library request failed: 503");
    expect(error.message).not.toContain("super-secret-token");
    expect(error.message).not.toContain("response-private-material");
    expect(error.message).not.toContain("Authorization");
  });
});
