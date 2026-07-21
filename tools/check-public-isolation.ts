import { randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { withQueueLock } from "../src/sync/queue-lock.js";
import { renameQueue } from "../src/sync/queue-rename.js";
import { BuildCleanupUnconfirmedError, runBuild } from "./build-process.js";
import {
  scanPublicArtifact,
  scanPublicDirectory,
} from "./public-artifact-scan.js";
import {
  createQueueRecovery,
  PublicIsolationRecoveryRequiredError,
  restoreQueueAndRemoveRecovery,
  validateQueueBytes,
} from "./public-isolation-recovery.js";

export {
  PublicIsolationRecoveryCleanupError,
  PublicIsolationRecoveryRequiredError,
} from "./public-isolation-recovery.js";

export const NONPUBLIC_SENTINEL = "__NONPUBLIC_SYNC_CANDIDATE_7f629d__";

type GateOptions = {
  root?: string;
  runBuild?: () => Promise<void>;
  buildTimeoutMilliseconds?: number;
  recoveryBase?: string;
};

const defaultBuildTimeoutMilliseconds = 120_000;

type Directory = { dev: number; ino: number; path: string; realPath: string };
type Queue = {
  destination: string;
  leaf: { dev: number; ino: number };
  review: Directory;
  root: Directory;
  directories: Directory[];
};

function within(root: string, path: string): boolean {
  const difference = relative(root, path);
  return (
    difference === "" ||
    (!difference.startsWith(`..${sep}`) &&
      difference !== ".." &&
      !isAbsolute(difference))
  );
}

async function directory(path: string, label: string): Promise<Directory> {
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link`);
  }
  return {
    path,
    realPath: await realpath(path),
    dev: stats.dev,
    ino: stats.ino,
  };
}

async function inspectQueue(root: string): Promise<Queue> {
  const rootDirectory = await directory(
    resolve(root),
    "Recommendation candidate queue root",
  );
  const data = await directory(
    join(rootDirectory.path, "data"),
    "Recommendation candidate queue parent",
  );
  const review = await directory(
    join(data.path, "review"),
    "Recommendation candidate queue parent",
  );
  if (
    !within(rootDirectory.realPath, data.realPath) ||
    !within(rootDirectory.realPath, review.realPath)
  ) {
    throw new Error("Recommendation candidate queue parent escapes root");
  }
  const destination = join(review.path, "sync-candidates.json");
  const leaf = await lstat(destination);
  if (!leaf.isFile() || leaf.isSymbolicLink()) {
    throw new Error(
      "Recommendation candidate queue destination must be a file",
    );
  }
  return {
    destination,
    leaf: { dev: leaf.dev, ino: leaf.ino },
    review,
    root: rootDirectory,
    directories: [rootDirectory, data, review],
  };
}

async function revalidateQueue(queue: Queue): Promise<void> {
  for (const current of queue.directories) {
    const now = await directory(
      current.path,
      "Recommendation candidate queue parent",
    );
    if (
      now.realPath !== current.realPath ||
      now.dev !== current.dev ||
      now.ino !== current.ino
    ) {
      throw new Error("Recommendation candidate queue parent identity changed");
    }
  }
  const leaf = await lstat(queue.destination);
  if (!leaf.isFile() || leaf.isSymbolicLink()) {
    throw new Error(
      "Recommendation candidate queue destination must be a file",
    );
  }
  if (leaf.dev !== queue.leaf.dev || leaf.ino !== queue.leaf.ino) {
    throw new Error(
      "Recommendation candidate queue destination identity changed",
    );
  }
}

async function writeQueue(queue: Queue, bytes: Uint8Array): Promise<void> {
  const temporary = join(
    queue.review.path,
    `.sync-candidates.json.${randomUUID()}.tmp`,
  );
  try {
    await revalidateQueue(queue);
    await writeFile(temporary, bytes, { flag: "wx" });
    await revalidateQueue(queue);
    await renameQueue(temporary, queue.destination, () =>
      revalidateQueue(queue),
    );
    const published = await lstat(queue.destination);
    if (!published.isFile() || published.isSymbolicLink()) {
      throw new Error(
        "Recommendation candidate queue destination must be a file",
      );
    }
    queue.leaf = { dev: published.dev, ino: published.ino };
  } catch (error: unknown) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function assertAbsent(root: string): Promise<void> {
  const sentinel = Buffer.from(NONPUBLIC_SENTINEL);
  await scanPublicDirectory(root, join(root, "dist"), sentinel);
  await scanPublicArtifact(
    root,
    join(root, "public", "search-index.json"),
    sentinel,
  );
}

export async function runPublicIsolationGate(
  options: GateOptions = {},
): Promise<void> {
  const root = options.root ?? process.cwd();
  const queue = await inspectQueue(root);
  await withQueueLock(queue.destination, async () => {
    await revalidateQueue(queue);
    const originalQueue = await readFile(queue.destination);
    validateQueueBytes(originalQueue);
    const recovery = await createQueueRecovery({
      bytes: originalQueue,
      projectRootPath: queue.root.path,
      projectRootRealPath: queue.root.realPath,
      revalidate: () => revalidateQueue(queue),
      ...(options.recoveryBase === undefined
        ? {}
        : { recoveryBase: options.recoveryBase }),
    });
    const candidates = [
      {
        rawText: NONPUBLIC_SENTINEL,
        risk: "high",
        status: "pending_verification",
      },
    ];
    let restoreRequired = false;
    let cleanupConfirmed = true;
    let failure: { error: unknown } | undefined;
    try {
      restoreRequired = true;
      await writeQueue(
        queue,
        Buffer.from(`${JSON.stringify(candidates, null, 2)}\n`),
      );
      await (options.runBuild?.() ??
        runBuild(
          root,
          options.buildTimeoutMilliseconds ?? defaultBuildTimeoutMilliseconds,
        ));
      await assertAbsent(root);
    } catch (error: unknown) {
      if (error instanceof BuildCleanupUnconfirmedError) {
        cleanupConfirmed = false;
        failure = {
          error: new PublicIsolationRecoveryRequiredError(recovery.path, error),
        };
      } else {
        failure = { error };
      }
    }
    if (cleanupConfirmed) {
      try {
        await restoreQueueAndRemoveRecovery(recovery, async () => {
          if (restoreRequired) await writeQueue(queue, originalQueue);
        });
      } catch (error: unknown) {
        failure = { error };
      }
    }
    if (failure !== undefined) throw failure.error;
  });
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  import.meta.url === pathToFileURL(resolve(entryPath)).href
) {
  await runPublicIsolationGate();
}
