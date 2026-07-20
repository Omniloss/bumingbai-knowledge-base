import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Episode, Person } from "../domain/schemas/catalog.js";
import { synchronizeCatalog as synchronizeCatalogDefault } from "./catalog-sync.js";
import type { RecommendationCandidate } from "./recommendation-parser.js";
import { parseRecommendationCandidates } from "./recommendation-parser.js";
import {
  queueRecommendationCandidates,
  writeRecommendationCandidateQueue,
} from "./recommendation-queue.js";
import { writeSnapshot as writeOfficialSnapshot } from "./snapshot.js";
import {
  loadCatalogState as loadCatalogStateFromDisk,
  loadLatestOfficialSnapshot,
  writeCatalogState as writeCatalogStateToDisk,
} from "./sync-state.js";
import type { OfficialEpisodeSnapshot, SyncChange } from "./types.js";

export { queueRecommendationCandidates, writeRecommendationCandidateQueue };

export type CatalogState = {
  readonly episodes: readonly Episode[];
  readonly people: readonly Person[];
};

type CatalogPaths = {
  readonly episodesPath: string;
  readonly peoplePath: string;
};
type CatalogSyncResult = {
  readonly episodes: readonly Episode[];
  readonly people: readonly Person[];
  readonly lowRiskChanges: readonly SyncChange[];
  readonly highRiskChanges: readonly SyncChange[];
};
type CatalogSynchronizeInput = {
  readonly catalog: CatalogState;
  readonly previousSnapshot: readonly OfficialEpisodeSnapshot[];
  readonly currentSnapshot: readonly OfficialEpisodeSnapshot[];
  readonly sourceChanges: readonly SyncChange[];
};
type SnapshotWriter = (
  root: string,
  snapshot: readonly OfficialEpisodeSnapshot[],
) => Promise<string>;
type CandidateQueueWriter = (
  root: string,
  candidates: RecommendationCandidate[],
) => Promise<string>;
type CatalogStateLoader = (root: string) => Promise<CatalogState>;
type CatalogStateWriter = (
  root: string,
  state: CatalogState,
) => Promise<CatalogPaths>;
type CatalogSynchronizer = (
  input: CatalogSynchronizeInput,
) => CatalogSyncResult | Promise<CatalogSyncResult>;
type SyncChangeWriter = (
  root: string,
  changes: SyncChange[],
) => Promise<string>;

export type RunSyncOptions = {
  readonly root: string;
  readonly previousSnapshot?: readonly OfficialEpisodeSnapshot[];
  readonly currentSnapshot: readonly OfficialEpisodeSnapshot[];
  readonly sourceChanges?: readonly SyncChange[];
  readonly loadCatalogState?: CatalogStateLoader;
  readonly synchronizeCatalog?: CatalogSynchronizer;
  readonly writeCatalogState?: CatalogStateWriter;
  readonly writeSnapshot?: SnapshotWriter;
  readonly writeCandidateQueue?: CandidateQueueWriter;
  readonly writeHighRiskChanges?: SyncChangeWriter;
};

export type RunSyncResult = {
  readonly snapshotPath: string;
  readonly candidateQueuePath: string;
  readonly syncChangesPath: string;
  readonly catalogPaths: CatalogPaths;
  readonly lowRiskChanges: readonly SyncChange[];
  readonly highRiskChanges: readonly SyncChange[];
};

function pathWithin(directory: string, target: string): boolean {
  const difference = relative(directory, target);
  return (
    difference !== "" &&
    difference !== ".." &&
    !difference.startsWith(`..${sep}`) &&
    !isAbsolute(difference)
  );
}

function changeKey(change: SyncChange): string {
  return `${change.episodeNumber}\u001f${change.field}`;
}

function stableChanges(changes: SyncChange[]): SyncChange[] {
  const seen = new Set<string>();
  return [...changes]
    .filter((change) => {
      const key = JSON.stringify([
        change.episodeNumber,
        change.field,
        change.before,
        change.after,
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (left, right) =>
        right.episodeNumber - left.episodeNumber ||
        (left.field < right.field ? -1 : left.field > right.field ? 1 : 0),
    );
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export async function writeHighRiskChanges(
  root: string,
  changes: SyncChange[],
): Promise<string> {
  const directory = resolve(root, "data", "review");
  const destination = resolve(directory, "sync-changes.json");
  if (!pathWithin(resolve(root), destination))
    throw new Error("Sync change artifact must remain inside the repository");
  const normalized = stableChanges(changes);
  if (normalized.length === 0) {
    try {
      await access(destination);
    } catch (error: unknown) {
      if (isMissing(error)) return destination;
      throw error;
    }
  }
  await mkdir(directory, { recursive: true });
  const temporary = resolve(directory, `.sync-changes.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporary, destination);
  } catch (error: unknown) {
    await rm(temporary, { force: true });
    throw error;
  }
  return destination;
}

async function candidatesFor(
  snapshot: readonly OfficialEpisodeSnapshot[],
): Promise<RecommendationCandidate[]> {
  return snapshot.flatMap((episode) =>
    parseRecommendationCandidates({
      episodeNumber: episode.number,
      html: episode.descriptionHtml,
      sourceUrl: episode.officialUrl,
      retrievedAt: episode.retrievedAt,
    }),
  );
}

export async function runSync(options: RunSyncOptions): Promise<RunSyncResult> {
  const previous =
    options.previousSnapshot ??
    (await loadLatestOfficialSnapshot(options.root))?.snapshot ??
    [];
  const sourceChanges = options.sourceChanges ?? [];
  const loadCatalogState = options.loadCatalogState ?? loadCatalogStateFromDisk;
  const synchronizeCatalog =
    options.synchronizeCatalog ??
    ((input: CatalogSynchronizeInput) =>
      synchronizeCatalogDefault({
        catalog: input.catalog,
        previousSnapshot:
          input.previousSnapshot === undefined
            ? undefined
            : [...input.previousSnapshot],
        currentSnapshot: [...input.currentSnapshot],
        sourceChanges: [...input.sourceChanges],
      }));
  const writeCatalogState =
    options.writeCatalogState ?? writeCatalogStateToDisk;
  const writeSnapshot =
    options.writeSnapshot ??
    ((root: string, snapshot: readonly OfficialEpisodeSnapshot[]) =>
      writeOfficialSnapshot(root, [...snapshot]));
  const writeCandidateQueue =
    options.writeCandidateQueue ??
    ((root: string, candidates: readonly RecommendationCandidate[]) =>
      writeRecommendationCandidateQueue(root, [...candidates]));
  const writeHighRisk = options.writeHighRiskChanges ?? writeHighRiskChanges;

  const catalog = await loadCatalogState(options.root);
  const transformed = await synchronizeCatalog({
    catalog,
    previousSnapshot: previous,
    currentSnapshot: options.currentSnapshot,
    sourceChanges,
  });
  const conflictKeys = new Set(sourceChanges.map(changeKey));
  const lowRiskChanges = transformed.lowRiskChanges.filter(
    (change) => !conflictKeys.has(changeKey(change)),
  );
  const highRiskChanges = stableChanges([
    ...transformed.highRiskChanges,
    ...sourceChanges,
  ]);
  const candidates = await candidatesFor(options.currentSnapshot);
  const candidateQueuePath = await writeCandidateQueue(
    options.root,
    queueRecommendationCandidates(candidates),
  );
  const syncChangesPath = await writeHighRisk(options.root, highRiskChanges);
  const catalogPaths = await writeCatalogState(options.root, {
    episodes: transformed.episodes,
    people: transformed.people,
  });
  const snapshotPath = await writeSnapshot(options.root, [
    ...options.currentSnapshot,
  ]);
  return {
    catalogPaths,
    snapshotPath,
    candidateQueuePath,
    syncChangesPath,
    lowRiskChanges,
    highRiskChanges,
  };
}
