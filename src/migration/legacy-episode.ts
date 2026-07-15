import { createStableId } from "../domain/id.js";
import type { Episode, Person } from "../domain/schemas/catalog.js";
import type { PersonId } from "../domain/schemas/primitives.js";
import { includePeople, type PeopleIndex } from "./legacy-people.js";
import type { LegacyEpisode } from "./legacy-schema.js";
import { officialEpisodeSource, splitNames } from "./legacy-shared.js";
import { CONFIRMED_CONFIDENCE } from "./legacy-status.js";

export type EpisodeMigration = {
  readonly episodes: readonly Episode[];
  readonly people: PeopleIndex;
};

export function migrateEpisodes(
  legacyEpisodes: readonly LegacyEpisode[],
  retrievedAt: string,
): EpisodeMigration {
  const initial: EpisodeMigration = {
    episodes: [],
    people: new Map<PersonId, Person>(),
  };
  return legacyEpisodes.reduce<EpisodeMigration>((state, item) => {
    const source = officialEpisodeSource(item.official_url, retrievedAt);
    const guestResult = includePeople(state.people, {
      names: splitNames(item.guest_or_participants),
      role: "guest",
      source,
      confidence: CONFIRMED_CONFIDENCE,
    });
    const id = createStableId("episode", String(item.episode_number));
    const episode: Episode = {
      id,
      slug: `ep-${String(item.episode_number).padStart(3, "0")}`,
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
    };
  }, initial);
}
