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
const ImagesResponseSchema = z.object({
  posters: z.array(
    z.object({
      file_path: z.string(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      iso_639_1: z.string().nullable().optional(),
    }),
  ),
});

export type TmdbRecord = {
  externalId: string;
  title: string;
  originalTitle: string;
  originalLanguage: string;
  releaseYear?: number;
  poster?: {
    handling: "hotlink_only";
    url: string;
    width: number;
    height: number;
    language?: string;
  };
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

  private headers(): HeadersInit {
    return {
      Accept: "application/json",
      Authorization: `Bearer ${this.token}`,
    };
  }

  private async poster(
    path: "movie" | "tv",
    externalId: number,
    posterPath: string | null,
  ): Promise<TmdbRecord["poster"]> {
    if (posterPath === null) return undefined;
    try {
      const response = await this.fetcher(
        `https://api.themoviedb.org/3/${path}/${externalId}/images`,
        { headers: this.headers() },
      );
      if (!response.ok) return undefined;
      const payload: unknown = await response.json();
      const poster = ImagesResponseSchema.parse(payload).posters.find(
        (candidate) => candidate.file_path === posterPath,
      );
      if (poster === undefined) return undefined;
      const result: TmdbRecord["poster"] = {
        handling: "hotlink_only",
        url: `https://image.tmdb.org/t/p/original${poster.file_path}`,
        width: poster.width,
        height: poster.height,
      };
      if (poster.iso_639_1 !== undefined && poster.iso_639_1 !== null) {
        result.language = poster.iso_639_1;
      }
      return result;
    } catch {
      return undefined;
    }
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
      headers: this.headers(),
    });
    if (!response.ok)
      throw new Error(`TMDB request failed: ${response.status}`);
    const payload: unknown = await response.json();
    const candidates =
      path === "movie"
        ? MovieResponseSchema.parse(payload).results.map((item) => ({
            item,
            record: movieRecord(item),
          }))
        : TvResponseSchema.parse(payload).results.map((item) => ({
            item,
            record: tvRecord(item),
          }));
    const matched = candidates.filter(({ record }) =>
      matches(
        query,
        record.originalTitle,
        record.originalLanguage,
        record.releaseYear,
      ),
    );
    const records = await Promise.all(
      matched.map(async ({ item, record }) => {
        const poster = await this.poster(path, item.id, item.poster_path);
        return poster === undefined ? record : { ...record, poster };
      }),
    );

    return {
      provider: this.name,
      retrievedAt: new Date().toISOString(),
      records,
    };
  }
}
