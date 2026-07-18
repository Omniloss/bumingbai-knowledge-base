import { z } from "zod";
import type { ProviderClient, ProviderResult, WorkLookup } from "./types.js";

const MovieSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  original_title: z.string(),
  original_language: z.string(),
  release_date: z.string(),
  poster_path: z.string().nullable(),
});
const TvSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  original_name: z.string(),
  original_language: z.string(),
  first_air_date: z.string(),
  poster_path: z.string().nullable(),
});
const MovieResponseSchema = z.object({ results: z.array(MovieSchema) });
const TvResponseSchema = z.object({ results: z.array(TvSchema) });

export type TmdbRecord = {
  externalId: string;
  title: string;
  originalTitle: string;
  originalLanguage: string;
  releaseYear?: number;
  posterPath?: string;
};

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function yearFromDate(value: string): number | undefined {
  const year = /^\d{4}/.exec(value)?.[0];
  return year === undefined ? undefined : Number(year);
}

function matches(
  query: WorkLookup,
  originalTitle: string,
  originalLanguage: string,
  releaseYear: number | undefined,
): boolean {
  const expectedTitle = query.originalTitle ?? query.title;
  return (
    normalize(originalTitle) === normalize(expectedTitle) &&
    (query.year === undefined || releaseYear === query.year) &&
    (query.originalLanguage === undefined ||
      originalLanguage === query.originalLanguage)
  );
}

function movieRecord(movie: z.infer<typeof MovieSchema>): TmdbRecord {
  const record: TmdbRecord = {
    externalId: String(movie.id),
    title: movie.title,
    originalTitle: movie.original_title,
    originalLanguage: movie.original_language,
  };
  const releaseYear = yearFromDate(movie.release_date);
  if (releaseYear !== undefined) record.releaseYear = releaseYear;
  if (movie.poster_path !== null) record.posterPath = movie.poster_path;
  return record;
}

function tvRecord(show: z.infer<typeof TvSchema>): TmdbRecord {
  const record: TmdbRecord = {
    externalId: String(show.id),
    title: show.name,
    originalTitle: show.original_name,
    originalLanguage: show.original_language,
  };
  const releaseYear = yearFromDate(show.first_air_date);
  if (releaseYear !== undefined) record.releaseYear = releaseYear;
  if (show.poster_path !== null) record.posterPath = show.poster_path;
  return record;
}

export class TmdbClient implements ProviderClient<TmdbRecord> {
  readonly name = "tmdb" as const;

  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!token) throw new Error("TMDB_API_TOKEN is required");
  }

  async lookup(query: WorkLookup): Promise<ProviderResult<TmdbRecord>> {
    const path =
      query.mediaType === "television"
        ? "tv"
        : query.mediaType === "film" || query.mediaType === "documentary"
          ? "movie"
          : undefined;
    if (path === undefined) {
      return {
        provider: this.name,
        retrievedAt: new Date().toISOString(),
        records: [],
      };
    }

    const url = new URL(`https://api.themoviedb.org/3/search/${path}`);
    url.searchParams.set("query", query.originalTitle ?? query.title);
    const response = await this.fetcher(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
      },
    });
    if (!response.ok)
      throw new Error(`TMDB request failed: ${response.status}`);
    const payload: unknown = await response.json();
    const records =
      path === "movie"
        ? MovieResponseSchema.parse(payload).results.map(movieRecord)
        : TvResponseSchema.parse(payload).results.map(tvRecord);

    return {
      provider: this.name,
      retrievedAt: new Date().toISOString(),
      records: records.filter((record) =>
        matches(
          query,
          record.originalTitle,
          record.originalLanguage,
          record.releaseYear,
        ),
      ),
    };
  }
}
