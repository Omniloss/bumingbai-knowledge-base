import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OfficialClient } from "../src/sync/official-client.js";
import {
  type RunSyncOptions,
  type RunSyncResult,
  runSync,
} from "../src/sync/run-sync.js";
import { loadLatestOfficialSnapshot } from "../src/sync/sync-state.js";
import type { OfficialEpisodeSnapshot } from "../src/sync/types.js";

type PreviousSnapshot = {
  readonly path: string;
  readonly snapshot: readonly OfficialEpisodeSnapshot[];
};
type PreviousSnapshotLoader = (
  root: string,
) => Promise<PreviousSnapshot | undefined>;
type SyncRunner = (options: RunSyncOptions) => Promise<RunSyncResult>;

export type SyncOfficialDependencies = {
  readonly loadPreviousSnapshot?: PreviousSnapshotLoader;
  readonly runSync?: SyncRunner;
};

export async function loadPreviousSnapshot(
  root: string,
): Promise<PreviousSnapshot | undefined> {
  return loadLatestOfficialSnapshot(root);
}

export async function syncOfficial(
  root: string,
  retrievedAt = new Date().toISOString(),
  fetcher?: typeof fetch,
  dependencies: SyncOfficialDependencies = {},
): Promise<RunSyncResult> {
  const loadPrevious =
    dependencies.loadPreviousSnapshot ?? loadPreviousSnapshot;
  const previous = await loadPrevious(root);
  const client = new OfficialClient(fetcher);
  const currentSnapshot = await client.fetchEpisodes(retrievedAt);
  const run = dependencies.runSync ?? runSync;
  return run({
    root,
    ...(previous === undefined ? {} : { previousSnapshot: previous.snapshot }),
    currentSnapshot,
    sourceChanges: client.changes,
  });
}

async function main(): Promise<void> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const result = await syncOfficial(root);
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        snapshotPath: result.snapshotPath,
        candidateQueuePath: result.candidateQueuePath,
        syncChangesPath: result.syncChangesPath,
        catalogPaths: result.catalogPaths,
        lowRiskChangeCount: result.lowRiskChanges.length,
        highRiskChangeCount: result.highRiskChanges.length,
      })}\n`,
    );
  } catch {
    process.stdout.write(
      `${JSON.stringify({ ok: false, error: "official sync failed" })}\n`,
    );
    process.stderr.write("Official sync failed\n");
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  void main();
