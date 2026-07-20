import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { Episode, Person } from "../domain/schemas/catalog.js";
import { EpisodeSchema, PersonSchema } from "../domain/schemas/entities.js";
import type { OfficialEpisodeSnapshot } from "./types.js";

export const OfficialSnapshotSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  publishedAt: z.string(),
  duration: z.string().optional(),
  officialUrl: z.string().url(),
  transcriptUrl: z.string().url().optional(),
  guestNames: z.array(z.string()),
  descriptionHtml: z.string(),
  sourceKind: z.enum(["official_rss", "official_wordpress"]),
  retrievedAt: z.string().datetime(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
});

export const OfficialSnapshotListSchema = z.array(OfficialSnapshotSchema);

export type CatalogState = {
  readonly episodes: readonly Episode[];
  readonly people: readonly Person[];
};

export type LoadedOfficialSnapshot = {
  readonly path: string;
  readonly snapshot: OfficialEpisodeSnapshot[];
};

export type SyncState = CatalogState & {
  readonly previousSnapshot: LoadedOfficialSnapshot | undefined;
};

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function readCatalogFile<T>(
  path: string,
  schema: z.ZodType<T>,
  fallback: T,
): Promise<T> {
  try {
    return schema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error: unknown) {
    if (isMissing(error)) return fallback;
    throw error;
  }
}

function compareSnapshotEntries(
  left: LoadedOfficialSnapshot,
  right: LoadedOfficialSnapshot,
): number {
  const leftAt = left.snapshot[0]?.retrievedAt ?? "";
  const rightAt = right.snapshot[0]?.retrievedAt ?? "";
  return leftAt === rightAt
    ? left.path < right.path
      ? -1
      : left.path > right.path
        ? 1
        : 0
    : leftAt < rightAt
      ? -1
      : 1;
}

export async function loadLatestOfficialSnapshot(
  root: string,
): Promise<LoadedOfficialSnapshot | undefined> {
  const directory = resolve(root, "data", "raw", "official");
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error: unknown) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  const candidates: LoadedOfficialSnapshot[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const path = join(directory, entry.name);
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    const parsedSnapshot = OfficialSnapshotListSchema.parse(parsed);
    const snapshot: OfficialEpisodeSnapshot[] = parsedSnapshot.map((item) => ({
      number: item.number,
      title: item.title,
      publishedAt: item.publishedAt,
      ...(item.duration === undefined ? {} : { duration: item.duration }),
      officialUrl: item.officialUrl,
      ...(item.transcriptUrl === undefined
        ? {}
        : { transcriptUrl: item.transcriptUrl }),
      guestNames: item.guestNames,
      descriptionHtml: item.descriptionHtml,
      sourceKind: item.sourceKind,
      retrievedAt: item.retrievedAt,
      contentHash: item.contentHash,
    }));
    if (snapshot.length > 0) candidates.push({ path, snapshot });
  }
  candidates.sort(compareSnapshotEntries);
  return candidates.at(-1);
}

export async function loadCatalogState(root: string): Promise<CatalogState> {
  const directory = resolve(root, "data", "catalog");
  const [episodes, people] = await Promise.all([
    readCatalogFile(
      join(directory, "episodes.json"),
      z.array(EpisodeSchema),
      [] as Episode[],
    ),
    readCatalogFile(
      join(directory, "people.json"),
      z.array(PersonSchema),
      [] as Person[],
    ),
  ]);
  return { episodes, people };
}

export async function loadSyncState(root: string): Promise<SyncState> {
  const [catalog, previousSnapshot] = await Promise.all([
    loadCatalogState(root),
    loadLatestOfficialSnapshot(root),
  ]);
  return { ...catalog, previousSnapshot };
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
  const directory = resolve(path, "..");
  const temporaryPath = join(
    directory,
    `.${path.split(/[\\/]/u).at(-1)}.${randomUUID()}.tmp`,
  );
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  try {
    await rename(temporaryPath, path);
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function writeCatalogState(
  root: string,
  state: CatalogState,
): Promise<{ episodesPath: string; peoplePath: string }> {
  const episodes = z.array(EpisodeSchema).parse(state.episodes);
  const people = z.array(PersonSchema).parse(state.people);
  const directory = resolve(root, "data", "catalog");
  await mkdir(directory, { recursive: true });
  const episodesPath = join(directory, "episodes.json");
  const peoplePath = join(directory, "people.json");
  await atomicWrite(peoplePath, people);
  await atomicWrite(episodesPath, episodes);
  return { episodesPath, peoplePath };
}

export const loadPreviousSnapshot = loadLatestOfficialSnapshot;
export const saveCatalogState = writeCatalogState;
export const writeNormalizedCatalog = writeCatalogState;
