import { createStableId } from "../domain/id.js";
import type { Episode, Person } from "../domain/schemas/catalog.js";
import { EpisodeSchema } from "../domain/schemas/entities.js";
import type { PersonId } from "../domain/schemas/primitives.js";
import {
  guestIdsFor,
  sourceFor,
  valuesForExistingGuests,
} from "./catalog-guests.js";
import { LOW_RISK_OFFICIAL_FIELDS } from "./classify-change.js";
import type { OfficialEpisodeSnapshot, SyncChange, SyncRisk } from "./types.js";

type Snapshot = OfficialEpisodeSnapshot;
type SyncableField = Exclude<
  (typeof LOW_RISK_OFFICIAL_FIELDS)[number],
  "number"
>;
const SYNCABLE_FIELDS = LOW_RISK_OFFICIAL_FIELDS.filter(
  (field): field is SyncableField => field !== "number",
);

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizedDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Official publishedAt must be a valid date");
  }
  return parsed.toISOString();
}

function episodeIdentity(snapshot: Snapshot): {
  id: Episode["id"];
  slug: string;
  number: Episode["number"];
} {
  const id = createStableId("episode", String(snapshot.number));
  return {
    id,
    slug: `ep-${String(snapshot.number).padStart(3, "0")}`,
    number: snapshot.number,
  };
}

export function change(
  episodeNumber: number,
  field: string,
  before: unknown,
  after: unknown,
  risk: SyncRisk,
): SyncChange {
  return { episodeNumber, field, before, after, risk };
}

function fieldValue(episode: Episode, field: SyncableField): unknown {
  switch (field) {
    case "title":
      return episode.title;
    case "publishedAt":
      return episode.publishedAt;
    case "duration":
      return episode.duration;
    case "officialUrl":
      return episode.officialUrl;
    case "transcriptUrl":
      return episode.transcriptUrl;
    case "guestNames":
      return undefined;
  }
}

function isConflicted(
  conflicts: ReadonlySet<string>,
  number: number,
  field: string,
): boolean {
  return conflicts.has(`${number}\u001f${field}`);
}

export function sourceConflictSet(
  sourceChanges: readonly SyncChange[],
): Set<string> {
  return new Set(
    sourceChanges.map((item) => `${item.episodeNumber}\u001f${item.field}`),
  );
}

export function updateEpisode(
  existing: Episode,
  current: Snapshot,
  previous: Snapshot | undefined,
  peopleById: Map<PersonId, Person>,
  conflicts: ReadonlySet<string>,
  lowRiskChanges: SyncChange[],
  highRiskChanges: SyncChange[],
): { episode: Episode; addedPeople: Person[] } {
  if (previous === undefined) return { episode: existing, addedPeople: [] };
  const number = current.number;
  const existingGuestNames = valuesForExistingGuests(
    existing.guestIds,
    peopleById,
  );
  const previousGuestNames = previous.guestNames;
  const currentGuestNames = current.guestNames;
  const guestConflict = isConflicted(conflicts, number, "guestNames");
  const guestResult = guestConflict
    ? { ids: [...existing.guestIds], added: [] }
    : guestIdsFor(currentGuestNames, peopleById, current);
  let clearDuration = false;
  let clearTranscriptUrl = false;
  let appliedGuestUpdate = false;
  const updates: {
    title?: string;
    publishedAt?: string;
    duration?: string;
    officialUrl?: string;
    transcriptUrl?: string;
    guestIds?: PersonId[];
  } = {};

  for (const field of SYNCABLE_FIELDS) {
    if (isConflicted(conflicts, number, field)) continue;
    const before =
      field === "guestNames"
        ? previousGuestNames
        : field === "publishedAt"
          ? normalizedDate(previous.publishedAt)
          : previous[field];
    const after =
      field === "publishedAt"
        ? normalizedDate(current.publishedAt)
        : field === "guestNames"
          ? currentGuestNames
          : current[field];
    if (sameValue(before, after)) continue;
    const catalogValue =
      field === "guestNames" ? existingGuestNames : fieldValue(existing, field);
    if (!sameValue(catalogValue, before)) {
      highRiskChanges.push(change(number, field, catalogValue, after, "high"));
      continue;
    }
    const risk =
      field === "guestNames" && guestResult.added.length > 0 ? "high" : "low";
    (risk === "low" ? lowRiskChanges : highRiskChanges).push(
      change(number, field, before, after, risk),
    );

    switch (field) {
      case "title":
        updates.title = current.title;
        break;
      case "publishedAt":
        updates.publishedAt = normalizedDate(current.publishedAt);
        break;
      case "duration":
        if (current.duration === undefined) clearDuration = true;
        else updates.duration = current.duration;
        break;
      case "officialUrl":
        updates.officialUrl = current.officialUrl;
        break;
      case "transcriptUrl":
        if (current.transcriptUrl === undefined) clearTranscriptUrl = true;
        else updates.transcriptUrl = current.transcriptUrl;
        break;
      case "guestNames":
        updates.guestIds = guestResult.ids;
        appliedGuestUpdate = true;
        break;
    }
  }

  for (const person of appliedGuestUpdate ? guestResult.added : []) {
    highRiskChanges.push(
      change(number, "person", undefined, person.id, "high"),
    );
  }
  const rawEpisode: { -readonly [K in keyof Episode]: Episode[K] } = {
    ...existing,
    ...updates,
  };
  if (clearDuration) delete rawEpisode.duration;
  if (clearTranscriptUrl) delete rawEpisode.transcriptUrl;
  return {
    episode: EpisodeSchema.parse(rawEpisode),
    addedPeople: appliedGuestUpdate ? guestResult.added : [],
  };
}

export function materializeEpisode(
  current: Snapshot,
  peopleById: Map<PersonId, Person>,
  highRiskChanges: SyncChange[],
): { episode: Episode; addedPeople: Person[] } {
  const identity = episodeIdentity(current);
  const guestResult = guestIdsFor(current.guestNames, peopleById, current);
  const episode = EpisodeSchema.parse({
    id: identity.id,
    slug: identity.slug,
    number: identity.number,
    title: current.title,
    publishedAt: normalizedDate(current.publishedAt),
    ...(current.duration === undefined ? {} : { duration: current.duration }),
    officialUrl: current.officialUrl,
    ...(current.transcriptUrl === undefined
      ? {}
      : { transcriptUrl: current.transcriptUrl }),
    guestIds: guestResult.ids,
    topicIds: [],
    verificationStatus: "partially_verified",
    publicationStatus: "public",
    sources: [sourceFor(current)],
  });
  highRiskChanges.push(
    change(current.number, "episode", undefined, episode.id, "high"),
  );
  for (const person of guestResult.added) {
    highRiskChanges.push(
      change(current.number, "person", undefined, person.id, "high"),
    );
  }
  return { episode, addedPeople: guestResult.added };
}
