import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { contentHash } from "./snapshot.js";
import type { OfficialEpisodeSnapshot, SyncChange } from "./types.js";

const RSS_URL = "https://feeds.acast.com/public/shows/68004395b4ef799a7a410371";
const WORDPRESS_URL = "https://bumingbai.net/wp-json/wp/v2/posts";
const WORDPRESS_GMT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/u;
const RSS_PUB_DATE_PATTERN =
  /^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} (?:GMT|[+-]\d{4})$/u;

function timestamp(value: string, assumeUtc = false): number | undefined {
  const normalized =
    assumeUtc && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/u.test(value)
      ? `${value}Z`
      : value;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function wordpressGmtTimestamp(value: string): number | undefined {
  if (!WORDPRESS_GMT_PATTERN.test(value)) return undefined;
  return timestamp(value, true);
}

function rssPublishedTimestamp(value: string): number | undefined {
  if (!RSS_PUB_DATE_PATTERN.test(value)) return undefined;
  return timestamp(value);
}

const WordpressPostSchema = z.object({
  date_gmt: z
    .string()
    .refine((value) => wordpressGmtTimestamp(value) !== undefined),
  link: z.url(),
  title: z.object({ rendered: z.string() }),
  content: z.object({ rendered: z.string() }),
});
const WordpressPostsSchema = z.array(WordpressPostSchema);
const RssItemSchema = z.object({
  title: z.string(),
  pubDate: z
    .string()
    .refine((value) => rssPublishedTimestamp(value) !== undefined),
  description: z.string().optional(),
  link: z.string().optional(),
  "itunes:duration": z.string().optional(),
  enclosure: z.object({ "@_url": z.string().optional() }).optional(),
});
const RssFeedSchema = z.object({
  rss: z.object({
    channel: z.object({
      item: z.preprocess(
        (value) => (Array.isArray(value) ? value : [value]),
        z.array(RssItemSchema),
      ),
    }),
  }),
});

type WordpressPost = z.infer<typeof WordpressPostSchema>;
type RssItem = z.infer<typeof RssItemSchema>;

function episodeNumber(value: string): number | undefined {
  const match = /\bEP\s*[-－]?\s*0*(\d+)\b/iu.exec(value);
  const number = match?.[1] === undefined ? Number.NaN : Number(match[1]);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function transcriptUrl(html: string): string | undefined {
  for (const match of html.matchAll(
    /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/giu,
  )) {
    const href = match[2];
    const label = match[3]?.replace(/<[^>]*>/gu, " ") ?? "";
    if (
      href !== undefined &&
      /(?:文字(?:版|稿)|transcript)/iu.test(label) &&
      z.url().safeParse(href).success
    ) {
      return href;
    }
  }
  return undefined;
}

function guestNames(html: string): string[] {
  const match = /(?:本期\s*)?嘉宾\s*[：:]\s*([^<\r\n]+)/iu.exec(html);
  const names = match?.[1];
  if (names === undefined) return [];
  return names
    .split(/[、，,和及]/u)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function sourceError(url: string, status: number): Error {
  return new Error(`Official source request failed: ${url} (${status})`);
}

function responseError(url: string, status: number): Error {
  return new Error(`Official source response invalid: ${url} (${status})`);
}

export class OfficialClient {
  readonly changes: SyncChange[] = [];

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async fetchEpisodes(now: string): Promise<OfficialEpisodeSnapshot[]> {
    this.changes.length = 0;
    const [rss, wordpress] = await Promise.all([
      this.fetchRss(),
      this.fetchWordpressPosts(),
    ]);
    const rssByNumber = new Map<number, RssItem>();
    const wordpressByNumber = new Map<number, WordpressPost>();

    for (const item of rss) {
      const number = episodeNumber(item.title);
      if (number !== undefined) rssByNumber.set(number, item);
    }
    for (const post of wordpress) {
      const number = episodeNumber(post.title.rendered);
      if (number !== undefined) wordpressByNumber.set(number, post);
    }

    return [...new Set([...rssByNumber.keys(), ...wordpressByNumber.keys()])]
      .sort((left, right) => right - left)
      .map((number) =>
        this.mergeEpisode(
          number,
          rssByNumber.get(number),
          wordpressByNumber.get(number),
          now,
        ),
      );
  }

  private async fetchRss(): Promise<RssItem[]> {
    const response = await this.fetcher(RSS_URL);
    if (!response.ok) throw sourceError(RSS_URL, response.status);
    try {
      const parsed: unknown = new XMLParser({
        ignoreAttributes: false,
        parseTagValue: false,
        trimValues: true,
      }).parse(await response.text());
      return RssFeedSchema.parse(parsed).rss.channel.item;
    } catch {
      throw responseError(RSS_URL, response.status);
    }
  }

  private async fetchWordpressPosts(): Promise<WordpressPost[]> {
    const posts: WordpressPost[] = [];
    for (let page = 1; ; page += 1) {
      const url = new URL(WORDPRESS_URL);
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", String(page));
      const response = await this.fetcher(url);
      if (!response.ok) throw sourceError(url.href, response.status);
      let pagePosts: WordpressPost[];
      try {
        const payload: unknown = await response.json();
        pagePosts = WordpressPostsSchema.parse(payload);
      } catch {
        throw responseError(url.href, response.status);
      }
      posts.push(...pagePosts);
      if (pagePosts.length < 100) return posts;
    }
  }

  private mergeEpisode(
    number: number,
    rss: RssItem | undefined,
    wordpress: WordpressPost | undefined,
    retrievedAt: string,
  ): OfficialEpisodeSnapshot {
    if (rss === undefined && wordpress === undefined) {
      throw new Error(`Missing official records for episode ${number}`);
    }
    if (
      rss !== undefined &&
      wordpress !== undefined &&
      rss.title !== wordpress.title.rendered
    ) {
      this.changes.push({
        episodeNumber: number,
        field: "title",
        before: wordpress.title.rendered,
        after: rss.title,
        risk: "high",
      });
    }
    if (
      rss !== undefined &&
      wordpress !== undefined &&
      rssPublishedTimestamp(rss.pubDate) !==
        wordpressGmtTimestamp(wordpress.date_gmt)
    ) {
      this.changes.push({
        episodeNumber: number,
        field: "publishedAt",
        before: wordpress.date_gmt,
        after: rss.pubDate,
        risk: "high",
      });
    }

    const record = {
      number,
      title: rss?.title ?? wordpress?.title.rendered ?? "",
      publishedAt: rss?.pubDate ?? wordpress?.date_gmt ?? "",
      officialUrl: wordpress?.link ?? rss?.link ?? "",
      guestNames:
        wordpress === undefined ? [] : guestNames(wordpress.content.rendered),
      descriptionHtml: wordpress?.content.rendered ?? rss?.description ?? "",
      sourceKind:
        wordpress === undefined ? "official_rss" : "official_wordpress",
      retrievedAt,
    } satisfies Omit<
      OfficialEpisodeSnapshot,
      "contentHash" | "duration" | "transcriptUrl"
    >;
    const duration = rss?.["itunes:duration"];
    const transcript =
      wordpress === undefined
        ? undefined
        : transcriptUrl(wordpress.content.rendered);
    const snapshot = {
      ...record,
      ...(duration === undefined ? {} : { duration }),
      ...(transcript === undefined ? {} : { transcriptUrl: transcript }),
    } satisfies Omit<OfficialEpisodeSnapshot, "contentHash">;
    return { ...snapshot, contentHash: contentHash(snapshot) };
  }
}
