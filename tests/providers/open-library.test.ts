import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { OpenLibraryClient } from "../../src/providers/open-library.js";

const fixtureUrl = new URL(
  "../fixtures/providers/open-library-search.json",
  import.meta.url,
);

describe("OpenLibraryClient", () => {
  it("returns only exact normalized title and author candidates", async () => {
    const requests: URL[] = [];
    const fetcher: typeof fetch = async (input) => {
      requests.push(new URL(input instanceof Request ? input.url : input));
      return new Response(await readFile(fixtureUrl, "utf8"), { status: 200 });
    };

    const result = await new OpenLibraryClient(fetcher).lookup({
      workId: "work_speak_memory",
      title: "  SPEAK,   MEMORY ",
      creatorNames: ["Vladimir Nabokov"],
      year: 1966,
      mediaType: "book",
    });

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
});
