import { createStableId } from "../domain/id.js";
import type {
  EpisodeId,
  RecommendationEvidenceId,
} from "../domain/schemas/primitives.js";
import type { LegacyEpisode, LegacyRecommendation } from "./legacy-schema.js";

export type LegacyEpisodeLookup = {
  readonly key: string;
  readonly stableParts: readonly string[];
  readonly description: string;
  readonly episodeNumber: number | null;
};

export type LegacyEpisodeIdentity = LegacyEpisodeLookup & {
  readonly id: EpisodeId;
  readonly slug: string;
};

function numberedLookup(number: number): LegacyEpisodeLookup {
  const stableParts = [String(number)];
  return {
    key: `number:${stableParts[0]}`,
    stableParts,
    description: `number ${number}`,
    episodeNumber: number,
  };
}

function unnumberedLookup(
  officialUrl: string,
  publishedAt: string,
): LegacyEpisodeLookup {
  return {
    key: `special:${officialUrl}\u001f${publishedAt}`,
    stableParts: [officialUrl, publishedAt],
    description: `official URL ${officialUrl} published at ${publishedAt}`,
    episodeNumber: null,
  };
}

export function legacyEpisodeLookup(
  episode: LegacyEpisode,
): LegacyEpisodeLookup {
  return episode.episode_number === null
    ? unnumberedLookup(episode.official_url, episode.published_at)
    : numberedLookup(episode.episode_number);
}

export function legacyRecommendationLookup(
  recommendation: LegacyRecommendation,
): LegacyEpisodeLookup {
  return recommendation.episode_number === null
    ? unnumberedLookup(
        recommendation.episode_official_url,
        recommendation.episode_published_at,
      )
    : numberedLookup(recommendation.episode_number);
}

export function legacyEpisodeIdentity(
  episode: LegacyEpisode,
): LegacyEpisodeIdentity {
  const lookup = legacyEpisodeLookup(episode);
  const id = createStableId("episode", ...lookup.stableParts);
  return {
    ...lookup,
    id,
    slug:
      episode.episode_number === null
        ? `special-${id.slice(-6)}`
        : `ep-${String(episode.episode_number).padStart(3, "0")}`,
  };
}

export function legacyEvidenceId(
  identity: LegacyEpisodeIdentity,
  order: number,
  rawText: string,
): RecommendationEvidenceId {
  return createStableId(
    "evidence",
    ...identity.stableParts,
    String(order),
    rawText,
  );
}
