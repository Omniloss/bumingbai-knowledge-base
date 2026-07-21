import { z } from "zod";
import type { ProviderName, ProviderResult } from "../providers/types.js";

const CoverSchema = z.object({
  handling: z.literal("hotlink_only"),
  url: z.url(),
  sourcePageUrl: z.url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
const PosterSchema = z.object({
  handling: z.literal("hotlink_only"),
  url: z.url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  language: z.string().optional(),
});
const CommonsImageSchema = z.object({
  url: z.url(),
  sourcePageUrl: z.url(),
  license: z.string().min(1),
  artist: z.string().min(1),
  credit: z.string().min(1),
  attribution: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  handling: z.enum(["hotlink_only", "mirror_allowed"]),
});

export const OpenLibraryCandidateSchema = z.object({
  externalId: z.string().min(1),
  title: z.string().min(1),
  authorNames: z.array(z.string()),
  firstPublishYear: z.number().int().optional(),
  cover: CoverSchema.optional(),
});
export const TmdbCandidateSchema = z.object({
  externalId: z.string().min(1),
  title: z.string().min(1),
  originalTitle: z.string().min(1),
  originalLanguage: z.string().min(1),
  releaseYear: z.number().int().optional(),
  poster: PosterSchema.optional(),
});
export const WikimediaCandidateSchema = z.object({
  externalId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  sourcePageUrl: z.url(),
  license: z.literal("CC0"),
  externalIds: z.record(z.string(), z.array(z.string())),
  instanceOf: z.array(z.string()).default([]),
  publicationYears: z.array(z.number().int()).default([]),
  image: CommonsImageSchema.optional(),
});

export type WikimediaCandidate = z.infer<typeof WikimediaCandidateSchema>;

export type ProviderCandidate =
  | {
      readonly provider: "open_library";
      readonly value: z.infer<typeof OpenLibraryCandidateSchema>;
    }
  | {
      readonly provider: "tmdb";
      readonly value: z.infer<typeof TmdbCandidateSchema>;
    }
  | {
      readonly provider: "wikidata";
      readonly value: z.infer<typeof WikimediaCandidateSchema>;
    };

function resultSchema(provider: ProviderName) {
  const recordSchema =
    provider === "open_library"
      ? OpenLibraryCandidateSchema
      : provider === "tmdb"
        ? TmdbCandidateSchema
        : provider === "wikidata"
          ? WikimediaCandidateSchema
          : z.unknown();
  return z.object({
    provider: z.literal(provider),
    retrievedAt: z.string().datetime(),
    records: z.array(recordSchema),
  });
}

export function parseProviderResult(
  provider: ProviderName,
  input: unknown,
): ProviderResult<unknown> {
  return resultSchema(provider).parse(input);
}

export function providerCandidates(
  provider: ProviderName,
  records: readonly unknown[],
): ProviderCandidate[] {
  if (provider === "open_library") {
    return records.map((value) => ({
      provider,
      value: OpenLibraryCandidateSchema.parse(value),
    }));
  }
  if (provider === "tmdb") {
    return records.map((value) => ({
      provider,
      value: TmdbCandidateSchema.parse(value),
    }));
  }
  if (provider === "wikidata") {
    return records.map((value) => ({
      provider,
      value: WikimediaCandidateSchema.parse(value),
    }));
  }
  return [];
}
