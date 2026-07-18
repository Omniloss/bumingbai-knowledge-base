import { z } from "zod";
import type { ProviderClient, ProviderResult, WorkLookup } from "./types.js";

const OpenLibraryResponseSchema = z.object({
  docs: z.array(
    z.object({
      key: z.string().regex(/^\/works\/[^/]+$/),
      title: z.string(),
      author_name: z.array(z.string()).optional(),
      cover_i: z.number().int().positive().optional(),
      first_publish_year: z.number().int().optional(),
    }),
  ),
});
const OpenLibraryCoverSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type OpenLibraryRecord = {
  externalId: string;
  title: string;
  authorNames: string[];
  firstPublishYear?: number;
  cover?: {
    handling: "hotlink_only";
    url: string;
    sourcePageUrl: string;
    width: number;
    height: number;
  };
};

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function authorsMatch(authorNames: string[], queryNames: string[]): boolean {
  if (queryNames.length === 0) return true;
  const normalizedAuthors = new Set(authorNames.map(normalize));
  return queryNames.some((name) => normalizedAuthors.has(normalize(name)));
}

function toRecord(
  document: z.infer<typeof OpenLibraryResponseSchema>["docs"][number],
  cover: OpenLibraryRecord["cover"],
): OpenLibraryRecord {
  const authorNames = document.author_name ?? [];
  const record: OpenLibraryRecord = {
    externalId: document.key.slice("/works/".length),
    title: document.title,
    authorNames,
  };

  if (document.first_publish_year !== undefined) {
    record.firstPublishYear = document.first_publish_year;
  }
  if (cover !== undefined) record.cover = cover;
  return record;
}

export class OpenLibraryClient implements ProviderClient<OpenLibraryRecord> {
  readonly name = "open_library" as const;

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  private async cover(
    coverId: number | undefined,
    workKey: string,
  ): Promise<OpenLibraryRecord["cover"]> {
    if (coverId === undefined) return undefined;
    try {
      const response = await this.fetcher(
        `https://covers.openlibrary.org/b/id/${coverId}.json`,
      );
      if (!response.ok) return undefined;
      const payload: unknown = await response.json();
      const metadata = OpenLibraryCoverSchema.parse(payload);
      return {
        handling: "hotlink_only",
        url: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`,
        sourcePageUrl: `https://openlibrary.org${workKey}`,
        width: metadata.width,
        height: metadata.height,
      };
    } catch {
      return undefined;
    }
  }

  async lookup(query: WorkLookup): Promise<ProviderResult<OpenLibraryRecord>> {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("title", query.title.trim());
    const author = query.creatorNames[0];
    if (author !== undefined) url.searchParams.set("author", author);
    url.searchParams.set("limit", "5");

    const response = await this.fetcher(url);
    if (!response.ok)
      throw new Error(`Open Library request failed: ${response.status}`);
    const payload: unknown = await response.json();
    const parsed = OpenLibraryResponseSchema.parse(payload);
    const title = normalize(query.title);

    const matched = parsed.docs.filter(
      (document) =>
        normalize(document.title) === title &&
        authorsMatch(document.author_name ?? [], query.creatorNames),
    );
    const records = await Promise.all(
      matched.map(async (document) =>
        toRecord(document, await this.cover(document.cover_i, document.key)),
      ),
    );

    return {
      provider: this.name,
      retrievedAt: new Date().toISOString(),
      records,
    };
  }
}
