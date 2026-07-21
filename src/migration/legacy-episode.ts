import type {
  Episode,
  Person,
  ReviewIssue,
} from "../domain/schemas/catalog.js";
import type { PersonId } from "../domain/schemas/primitives.js";
import { legacyEpisodeIdentity } from "./legacy-episode-identity.js";
import { migrateGuests } from "./legacy-guests.js";
import type { PeopleIndex } from "./legacy-people.js";
import type { LegacyEpisode } from "./legacy-schema.js";
import { officialEpisodeSource } from "./legacy-shared.js";

export type EpisodeMigration = {
  readonly episodes: readonly Episode[];
  readonly people: PeopleIndex;
  readonly reviewIssues: readonly ReviewIssue[];
};

export function migrateEpisodes(
  legacyEpisodes: readonly LegacyEpisode[],
  retrievedAt: string,
): EpisodeMigration {
  const initial: EpisodeMigration = {
    episodes: [],
    people: new Map<PersonId, Person>(),
    reviewIssues: [],
  };
  return legacyEpisodes.reduce<EpisodeMigration>((state, item) => {
    const source = officialEpisodeSource(item.official_url, retrievedAt);
    const identity = legacyEpisodeIdentity(item);
    const guestResult = migrateGuests({
      people: state.people,
      rawGuest: item.guest_or_participants,
      evidence: item.guest_evidence,
      episodeId: identity.id,
      source,
    });
    const episode: Episode = {
      id: identity.id,
      slug: identity.slug,
      number: item.episode_number,
      title: item.title,
      publishedAt: item.published_at,
      ...(item.duration ? { duration: item.duration } : {}),
      officialUrl: item.official_url,
      ...(item.transcript_url ? { transcriptUrl: item.transcript_url } : {}),
      guestIds: guestResult.ids,
      topicIds: [],
      verificationStatus: "partially_verified",
      publicationStatus: "public",
      sources: [source],
    };
    return {
      episodes: [...state.episodes, episode],
      people: guestResult.people,
      reviewIssues: [...state.reviewIssues, ...guestResult.reviewIssues],
    };
  }, initial);
}
