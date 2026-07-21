import { createSlug, createStableId } from "../domain/id.js";
import type { Person } from "../domain/schemas/catalog.js";
import { PersonSchema } from "../domain/schemas/entities.js";
import type { PersonId } from "../domain/schemas/primitives.js";
import type { OfficialEpisodeSnapshot } from "./types.js";

function sourceKind(
  snapshot: OfficialEpisodeSnapshot,
): "official_episode" | "official_rss" {
  return snapshot.sourceKind === "official_rss"
    ? "official_rss"
    : "official_episode";
}

export function sourceFor(snapshot: OfficialEpisodeSnapshot) {
  return {
    kind: sourceKind(snapshot),
    url: snapshot.officialUrl,
    retrievedAt: snapshot.retrievedAt,
  } as const;
}

function createPerson(name: string, snapshot: OfficialEpisodeSnapshot): Person {
  const id = createStableId("person", name);
  return PersonSchema.parse({
    id,
    slug: `${createSlug(name)}-${id.slice(-6)}`,
    name,
    aliases: [],
    roles: ["guest"],
    verificationStatus: "partially_verified",
    publicationStatus: "public",
    sources: [sourceFor(snapshot)],
  });
}

export function valuesForExistingGuests(
  guestIds: readonly PersonId[],
  peopleById: ReadonlyMap<PersonId, Person>,
): string[] {
  return guestIds.flatMap((id) => {
    const person = peopleById.get(id);
    return person === undefined ? [] : [person.name];
  });
}

export function guestIdsFor(
  names: readonly string[],
  peopleById: Map<PersonId, Person>,
  snapshot: OfficialEpisodeSnapshot,
): { ids: PersonId[]; added: Person[] } {
  const ids: PersonId[] = [];
  const added: Person[] = [];
  const seen = new Set<PersonId>();
  for (const rawName of names) {
    const name = rawName.trim();
    if (name.length === 0) continue;
    const id = createStableId("person", name);
    if (!seen.has(id)) {
      ids.push(id);
      seen.add(id);
    }
    if (!peopleById.has(id)) {
      const person = createPerson(name, snapshot);
      peopleById.set(id, person);
      added.push(person);
    }
  }
  return { ids, added };
}
