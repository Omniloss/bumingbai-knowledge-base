import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { OfficialClient } from "../../src/sync/official-client.js";

const wordpressFixtureUrl = new URL(
  "../fixtures/sync/wordpress-posts.json",
  import.meta.url,
);

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <item>
      <title>EP-223 不明白下午茶｜高铁、AI与中国世纪</title>
      <pubDate>Fri, 10 Jul 2026 12:54:34 GMT</pubDate>
      <itunes:duration>1:05:42</itunes:duration>
      <enclosure url="https://media.example.test/223.mp3" type="audio/mpeg" />
    </item>
  </channel>
</rss>`;

function wordpressPost(overrides: Record<string, unknown> = {}) {
  return {
    date_gmt: "2026-07-10T12:54:34Z",
    link: "https://bumingbai.net/2026/07/10/ep-223/",
    title: { rendered: "EP-223 不明白下午茶｜高铁、AI与中国世纪" },
    content: { rendered: "<p>节目正文</p>" },
    ...overrides,
  };
}

describe("OfficialClient", () => {
  it("merges official RSS and WordPress records with injected fetch", async () => {
    const requests: URL[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push(url);
      if (url.hostname === "feeds.acast.com") {
        return new Response(rss, { status: 200 });
      }
      return new Response(await readFile(wordpressFixtureUrl, "utf8"), {
        status: 200,
      });
    };

    const client = new OfficialClient(fetcher);
    const episodes = await client.fetchEpisodes("2026-07-18T00:00:00.000Z");

    expect(requests).toHaveLength(2);
    expect(requests[0]?.href).toBe(
      "https://feeds.acast.com/public/shows/68004395b4ef799a7a410371",
    );
    expect(requests[1]?.href).toBe(
      "https://bumingbai.net/wp-json/wp/v2/posts?per_page=100&page=1",
    );
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      number: 223,
      title: expect.any(String),
      officialUrl: expect.stringContaining("bumingbai.net"),
      sourceKind: "official_wordpress",
      publishedAt: "Fri, 10 Jul 2026 12:54:34 GMT",
      duration: "1:05:42",
      transcriptUrl: "https://bumingbai.net/2026/07/11/ep-223-text/",
      guestNames: ["查建英", "袁莉"],
    });
    expect(episodes[0]?.title).toBe("EP-223 不明白下午茶｜高铁、AI与中国世纪");
    expect(episodes[0]?.descriptionHtml).toContain("本期嘉宾");
    expect(episodes[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(client.changes).toContainEqual({
      episodeNumber: 223,
      field: "title",
      before: "EP-223 不同的官网标题",
      after: "EP-223 不明白下午茶｜高铁、AI与中国世纪",
      risk: "high",
    });
  });

  it("reports only the official URL and HTTP status for failed responses", async () => {
    const fetcher: typeof fetch = async () =>
      new Response("private-response-content", {
        status: 503,
      });

    const error = await new OfficialClient(fetcher)
      .fetchEpisodes("2026-07-18T00:00:00.000Z")
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected official error");
    expect(error.message).toBe(
      "Official source request failed: https://feeds.acast.com/public/shows/68004395b4ef799a7a410371 (503)",
    );
    expect(error.message).not.toContain("private-response-content");
  });

  it("includes RSS-only fields in the snapshot content hash", async () => {
    const fetcher =
      (rssBody: string): typeof fetch =>
      async (input) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.hostname === "feeds.acast.com") {
          return new Response(rssBody, { status: 200 });
        }
        return new Response(await readFile(wordpressFixtureUrl, "utf8"), {
          status: 200,
        });
      };

    const baseline = await new OfficialClient(fetcher(rss)).fetchEpisodes(
      "2026-07-18T00:00:00.000Z",
    );
    const changed = await new OfficialClient(
      fetcher(rss.replace("1:05:42", "1:05:43")),
    ).fetchEpisodes("2026-07-18T00:00:00.000Z");

    expect(changed[0]?.contentHash).not.toBe(baseline[0]?.contentHash);
  });

  it("records materially different RSS and WordPress publication times", async () => {
    const wordpress = wordpressPost({ date_gmt: "2026-07-10T12:55:34Z" });
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      return new Response(
        url.hostname === "feeds.acast.com" ? rss : JSON.stringify([wordpress]),
        {
          status: 200,
        },
      );
    };

    const client = new OfficialClient(fetcher);
    await client.fetchEpisodes("2026-07-18T00:00:00.000Z");

    expect(client.changes).toContainEqual({
      episodeNumber: 223,
      field: "publishedAt",
      before: "2026-07-10T12:55:34Z",
      after: "Fri, 10 Jul 2026 12:54:34 GMT",
      risk: "high",
    });
  });

  it("does not flag publication times that normalize to the same instant", async () => {
    const wordpress = wordpressPost({ date_gmt: "2026-07-10T20:54:34+08:00" });
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      return new Response(
        url.hostname === "feeds.acast.com" ? rss : JSON.stringify([wordpress]),
        {
          status: 200,
        },
      );
    };

    const client = new OfficialClient(fetcher);
    await client.fetchEpisodes("2026-07-18T00:00:00.000Z");

    expect(client.changes).not.toContainEqual(
      expect.objectContaining({ field: "publishedAt" }),
    );
  });

  it("aggregates short WordPress pagination without requesting a third page", async () => {
    const requestedPages: string[] = [];
    const pageOne = Array.from({ length: 100 }, (_, index) =>
      wordpressPost({
        link: `https://bumingbai.net/episodes/ep-${index + 1}/`,
        title: { rendered: `EP-${index + 1} 第${index + 1}期` },
      }),
    );
    const pageTwo = [
      wordpressPost({
        link: "https://bumingbai.net/episodes/ep-101/",
        title: { rendered: "EP-101 第101期" },
      }),
    ];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.hostname === "feeds.acast.com") {
        return new Response(rss, { status: 200 });
      }
      const page = url.searchParams.get("page");
      if (page === null) throw new Error("Expected a WordPress page parameter");
      requestedPages.push(page);
      return new Response(JSON.stringify(page === "1" ? pageOne : pageTwo), {
        status: 200,
      });
    };

    const episodes = await new OfficialClient(fetcher).fetchEpisodes(
      "2026-07-18T00:00:00.000Z",
    );

    expect(requestedPages).toEqual(["1", "2"]);
    expect(episodes.map((episode) => episode.number)).toEqual(
      expect.arrayContaining([1, 101]),
    );
  });

  it("keeps malformed HTTP-200 RSS payload details out of errors", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      return new Response(
        url.hostname === "feeds.acast.com"
          ? "<unexpected session_id=private>"
          : JSON.stringify([]),
        { status: 200 },
      );
    };

    const error = await new OfficialClient(fetcher)
      .fetchEpisodes("2026-07-18T00:00:00.000Z")
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected official error");
    expect(error.message).toBe(
      "Official source response invalid: https://feeds.acast.com/public/shows/68004395b4ef799a7a410371 (200)",
    );
    expect(error.message).not.toContain("session_id");
  });

  it("keeps malformed HTTP-200 WordPress payload details out of errors", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      return new Response(
        url.hostname === "feeds.acast.com"
          ? rss
          : JSON.stringify({ session_id: "private" }),
        { status: 200 },
      );
    };

    const error = await new OfficialClient(fetcher)
      .fetchEpisodes("2026-07-18T00:00:00.000Z")
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected official error");
    expect(error.message).toBe(
      "Official source response invalid: https://bumingbai.net/wp-json/wp/v2/posts?per_page=100&page=1 (200)",
    );
    expect(error.message).not.toContain("session_id");
  });

  it("rejects an invalid RSS publication date without leaking it", async () => {
    const invalidDate = "invalid-rss-date-session";
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      return new Response(
        url.hostname === "feeds.acast.com"
          ? rss.replace("Fri, 10 Jul 2026 12:54:34 GMT", invalidDate)
          : JSON.stringify([wordpressPost()]),
        { status: 200 },
      );
    };

    const error = await new OfficialClient(fetcher)
      .fetchEpisodes("2026-07-18T00:00:00.000Z")
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected official error");
    expect(error.message).toBe(
      "Official source response invalid: https://feeds.acast.com/public/shows/68004395b4ef799a7a410371 (200)",
    );
    expect(error.message).not.toContain(invalidDate);
  });

  it("rejects an invalid WordPress GMT date without leaking it", async () => {
    const invalidDate = "invalid-wordpress-date-session";
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      return new Response(
        url.hostname === "feeds.acast.com"
          ? rss
          : JSON.stringify([wordpressPost({ date_gmt: invalidDate })]),
        { status: 200 },
      );
    };

    const error = await new OfficialClient(fetcher)
      .fetchEpisodes("2026-07-18T00:00:00.000Z")
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected official error");
    expect(error.message).toBe(
      "Official source response invalid: https://bumingbai.net/wp-json/wp/v2/posts?per_page=100&page=1 (200)",
    );
    expect(error.message).not.toContain(invalidDate);
  });
});
