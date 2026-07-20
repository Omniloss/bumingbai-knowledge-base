import { lstat, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export type QueueRecovery = {
  directory: string;
  path: string;
};

type RecoveryOptions = {
  bytes: Uint8Array;
  projectRootPath: string;
  projectRootRealPath: string;
  recoveryBase?: string;
  revalidate: () => Promise<void>;
  remove?: (recovery: QueueRecovery) => Promise<void>;
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

export class PublicIsolationRecoveryRequiredError extends Error {
  readonly recoveryPath: string;

  constructor(recoveryPath: string, cause: unknown) {
    const reason =
      cause instanceof Error
        ? cause.message
        : "Public isolation queue restoration failed";
    super(`${reason}; original queue recovery retained at ${recoveryPath}`, {
      cause,
    });
    this.name = "PublicIsolationRecoveryRequiredError";
    this.recoveryPath = recoveryPath;
  }
}

export class PublicIsolationRecoveryCleanupError extends Error {
  readonly recoveryPath: string;

  constructor(
    recoveryPath: string,
    cause: unknown,
    canonicalQueueState: "restored" | "unmodified" = "restored",
  ) {
    const queueState =
      canonicalQueueState === "restored"
        ? "Canonical queue restored"
        : "Canonical queue was not modified";
    super(
      `${queueState}, but temporary recovery cleanup could not be confirmed at ${recoveryPath}`,
      { cause },
    );
    this.name = "PublicIsolationRecoveryCleanupError";
    this.recoveryPath = recoveryPath;
  }
}

export function validateQueueBytes(bytes: Uint8Array): void {
  let parsed: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Recommendation candidate queue must contain valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Recommendation candidate queue must be a JSON array");
  }
}

export async function createQueueRecovery(
  options: RecoveryOptions,
): Promise<QueueRecovery> {
  const base = options.recoveryBase ?? tmpdir();
  await options.revalidate();
  const directory = await mkdtemp(
    join(base, "bumingbai-public-isolation-recovery-"),
  );
  const path = join(directory, "sync-candidates.json");
  const recovery = { directory, path };
  try {
    const parentStats = await lstat(directory);
    if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
      throw new Error(
        "Recommendation candidate queue recovery parent must be a directory",
      );
    }
    const recoveryRealPath = await realpath(directory);
    if (
      within(resolve(options.projectRootPath), resolve(directory)) ||
      within(options.projectRootRealPath, recoveryRealPath)
    ) {
      throw new Error(
        "Recommendation candidate queue recovery directory must be outside the project root",
      );
    }
    await writeFile(path, options.bytes, { flag: "wx", mode: 0o600 });
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error("Recommendation candidate queue recovery must be a file");
    }
    await options.revalidate();
    return recovery;
  } catch (error: unknown) {
    try {
      await (options.remove ?? removeQueueRecovery)(recovery);
    } catch (cleanupError: unknown) {
      throw new PublicIsolationRecoveryCleanupError(
        path,
        new AggregateError(
          [error, cleanupError],
          "Recovery setup failed and cleanup could not be confirmed",
        ),
        "unmodified",
      );
    }
    throw error;
  }
}

export async function removeQueueRecovery(
  recovery: QueueRecovery,
): Promise<void> {
  await rm(resolve(recovery.directory), { force: true, recursive: true });
}

export async function restoreQueueAndRemoveRecovery(
  recovery: QueueRecovery,
  restore: () => Promise<void>,
  remove: (recovery: QueueRecovery) => Promise<void> = removeQueueRecovery,
): Promise<void> {
  try {
    await restore();
  } catch (error: unknown) {
    throw new PublicIsolationRecoveryRequiredError(recovery.path, error);
  }
  try {
    await remove(recovery);
  } catch (error: unknown) {
    throw new PublicIsolationRecoveryCleanupError(recovery.path, error);
  }
}
