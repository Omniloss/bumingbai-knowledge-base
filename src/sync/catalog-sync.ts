import type { Episode, Person } from "../domain/schemas/catalog.js";
import { EpisodeSchema, PersonSchema } from "../domain/schemas/entities.js";
import {
  change,
  materializeEpisode,
  sourceConflictSet,
  updateEpisode,
} from "./catalog-episodes.js";
import type { OfficialEpisodeSnapshot, SyncChange } from "./types.js";

type Snapshot = OfficialEpisodeSnapshot;
type SnapshotInput =
  | readonly Snapshot[]
  | { readonly snapshot: readonly Snapshot[] }
  | undefined;
type CatalogSlices = {
  readonly episodes: readonly Episode[];
  readonly people: readonly Person[];
};

export type CatalogSyncResult = {
  readonly episodes: Episode[];
  readonly people: Person[];
  readonly catalog: CatalogSlices;
  readonly lowRiskChanges: SyncChange[];
  readonly highRiskChanges: SyncChange[];
  readonly materializedEpisodes: Episode[];
  readonly materializedPeople: Person[];
};

export type SynchronizeCatalogOptions = {
  readonly catalog?: CatalogSlices;
  readonly episodes?: readonly Episode[];
  readonly people?: readonly Person[];
  readonly previousSnapshot?: SnapshotInput;
  readonly currentSnapshot: readonly Snapshot[];
  readonly sourceChanges?: readonly SyncChange[];
};

export type TransformSnapshotOptions = {
  readonly previousSnapshot?: SnapshotInput;
  readonly sourceChanges?: readonly SyncChange[];
};

function snapshots(value: SnapshotInput): Snapshot[] {
  if (value === undefined) return [];
  if ("snapshot" in value) return [...value.snapshot];
  return [...value];
}

function previousByNumber(
  previous: readonly Snapshot[],
): Map<number, Snapshot> {
  return new Map(previous.map((item) => [item.number, item]));
}

export function synchronizeCatalog(
  options: SynchronizeCatalogOptions,
): CatalogSyncResult {
  const catalog = options.catalog ?? {
    episodes: options.episodes ?? [],
    people: options.people ?? [],
  };
  const existingEpisodes = [...catalog.episodes].map((item) =>
    EpisodeSchema.parse(item),
  );
  const people = [...catalog.people].map((item) => PersonSchema.parse(item));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const previous = snapshots(options.previousSnapshot);
  const previousByNumberMap = previousByNumber(previous);
  const sourceChanges = [...(options.sourceChanges ?? [])];
  const conflicts = sourceConflictSet(sourceChanges);
  const lowRiskChanges: SyncChange[] = [];
  const highRiskChanges: SyncChange[] = sourceChanges.map((item) => ({
    ...item,
    risk: "high" as const,
  }));
  const currentByNumber = new Map(
    options.currentSnapshot.map((item) => [item.number, item]),
  );
  const materializedEpisodes: Episode[] = [];
  const materializedPeople: Person[] = [];
  const updatedEpisodes = existingEpisodes.map((existing) => {
    if (existing.number === null) return existing;
    const current = currentByNumber.get(existing.number);
    if (current === undefined) return existing;
    const prior = previousByNumberMap.get(current.number);
    if (prior !== undefined && prior.sourceKind !== current.sourceKind) {
      highRiskChanges.push(
        change(
          current.number,
          "sourceKind",
          prior.sourceKind,
          current.sourceKind,
          "high",
        ),
      );
    }
    if (current.number !== existing.number) {
      highRiskChanges.push(
        change(
          current.number,
          "number",
          existing.number,
          current.number,
          "high",
        ),
      );
      return existing;
    }
    const updated = updateEpisode(
      existing,
      current,
      prior,
      peopleById,
      conflicts,
      lowRiskChanges,
      highRiskChanges,
    );
    materializedPeople.push(...updated.addedPeople);
    return updated.episode;
  });
  const existingNumbers = new Set(
    existingEpisodes.flatMap((episode) =>
      episode.number === null ? [] : [episode.number],
    ),
  );
  for (const current of options.currentSnapshot) {
    if (existingNumbers.has(current.number)) continue;
    const prior = previousByNumberMap.get(current.number);
    if (prior !== undefined && prior.sourceKind !== current.sourceKind) {
      highRiskChanges.push(
        change(
          current.number,
          "sourceKind",
          prior.sourceKind,
          current.sourceKind,
          "high",
        ),
      );
    }
    const created = materializeEpisode(current, peopleById, highRiskChanges);
    materializedEpisodes.push(created.episode);
    materializedPeople.push(...created.addedPeople);
    updatedEpisodes.push(created.episode);
  }
  const finalPeople = people.filter(
    (person) => !materializedPeople.some((item) => item.id === person.id),
  );
  finalPeople.push(
    ...materializedPeople.filter(
      (person, index, values) =>
        values.findIndex((candidate) => candidate.id === person.id) === index,
    ),
  );
  return {
    episodes: updatedEpisodes,
    people: finalPeople,
    catalog: { episodes: updatedEpisodes, people: finalPeople },
    lowRiskChanges,
    highRiskChanges,
    materializedEpisodes,
    materializedPeople: finalPeople.filter((person) =>
      materializedPeople.some((candidate) => candidate.id === person.id),
    ),
  };
}

export function transformOfficialSnapshot(
  currentSnapshot: readonly Snapshot[],
  existingEpisodes: readonly Episode[],
  existingPeople: readonly Person[],
  options: TransformSnapshotOptions = {},
): CatalogSyncResult {
  return synchronizeCatalog({
    catalog: { episodes: existingEpisodes, people: existingPeople },
    currentSnapshot,
    ...options,
  });
}

export const applyOfficialSnapshot = transformOfficialSnapshot;
export const applyCatalogSync = synchronizeCatalog;
export const syncCatalog = synchronizeCatalog;
