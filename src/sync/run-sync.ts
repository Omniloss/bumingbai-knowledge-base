import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { renameQueue } from "./queue-rename.js";
import type { RecommendationCandidate } from "./recommendation-parser.js";

const writes = new Map<string, Promise<string>>();

type DirectoryIdentity = {
  path: string;
  realPath: string;
  dev: number;
  ino: number;
};
type QueuePaths = {
  root: DirectoryIdentity;
  data: DirectoryIdentity;
  review: DirectoryIdentity;
  destination: string;
};

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function compareCandidates(
  left: RecommendationCandidate,
  right: RecommendationCandidate,
): number {
  return (
    right.episodeNumber - left.episodeNumber ||
    compareText(left.rawText, right.rawText) ||
    compareText(left.sourceUrl, right.sourceUrl) ||
    compareText(left.recommenderLabel ?? "", right.recommenderLabel ?? "") ||
    compareText(left.locator, right.locator) ||
    compareText(left.retrievedAt, right.retrievedAt)
  );
}

function candidateKey(candidate: RecommendationCandidate): string {
  return JSON.stringify([
    candidate.episodeNumber,
    candidate.rawText,
    candidate.sourceUrl,
  ]);
}

function pathWithin(directory: string, path: string): boolean {
  const difference = relative(directory, path);
  return (
    difference === "" ||
    (!difference.startsWith(`..${sep}`) &&
      difference !== ".." &&
      !isAbsolute(difference))
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

async function existingStats(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error: unknown) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

function checkedDirectoryStats(stats: Stats, label: string): void {
  if (stats.isSymbolicLink())
    throw new Error(`${label} must not be a symbolic link`);
  if (!stats.isDirectory()) throw new Error(`${label} must be a directory`);
}

async function prepareDirectory(
  path: string,
  label: string,
): Promise<DirectoryIdentity> {
  const before = await existingStats(path);
  if (before !== undefined) checkedDirectoryStats(before, label);
  if (before === undefined) await mkdir(path);
  const stats = await lstat(path);
  checkedDirectoryStats(stats, label);
  return {
    path,
    realPath: await realpath(path),
    dev: stats.dev,
    ino: stats.ino,
  };
}

async function prepareQueuePaths(root: string): Promise<QueuePaths> {
  const rootPath = resolve(root);
  const rootStats = await existingStats(rootPath);
  if (rootStats === undefined)
    throw new Error("Recommendation candidate queue root must be a directory");
  checkedDirectoryStats(rootStats, "Recommendation candidate queue root");
  const rootDirectory: DirectoryIdentity = {
    path: rootPath,
    realPath: await realpath(rootPath),
    dev: rootStats.dev,
    ino: rootStats.ino,
  };
  const data = await prepareDirectory(
    resolve(rootPath, "data"),
    "Recommendation candidate queue parent",
  );
  if (!pathWithin(rootDirectory.realPath, data.realPath)) {
    throw new Error("Recommendation candidate queue parent escapes root");
  }
  const review = await prepareDirectory(
    resolve(data.path, "review"),
    "Recommendation candidate queue parent",
  );
  if (!pathWithin(rootDirectory.realPath, review.realPath)) {
    throw new Error("Recommendation candidate queue parent escapes root");
  }
  return {
    root: rootDirectory,
    data,
    review,
    destination: resolve(review.path, "sync-candidates.json"),
  };
}

async function revalidateDirectory(
  directory: DirectoryIdentity,
  label: string,
): Promise<void> {
  const stats = await lstat(directory.path);
  checkedDirectoryStats(stats, label);
  const currentRealPath = await realpath(directory.path);
  if (
    currentRealPath !== directory.realPath ||
    stats.dev !== directory.dev ||
    stats.ino !== directory.ino
  ) {
    throw new Error(`${label} identity changed`);
  }
}

async function verifyDestination(paths: QueuePaths): Promise<void> {
  if (!pathWithin(paths.review.path, paths.destination)) {
    throw new Error(
      "Recommendation candidate queue destination escapes review directory",
    );
  }
  const stats = await existingStats(paths.destination);
  if (stats?.isSymbolicLink())
    throw new Error(
      "Recommendation candidate queue destination must not be a symbolic link",
    );
  if (stats !== undefined && !stats.isFile())
    throw new Error(
      "Recommendation candidate queue destination must be a file",
    );
}

async function revalidatePaths(paths: QueuePaths): Promise<void> {
  await revalidateDirectory(paths.root, "Recommendation candidate queue root");
  await revalidateDirectory(
    paths.data,
    "Recommendation candidate queue parent",
  );
  await revalidateDirectory(
    paths.review,
    "Recommendation candidate queue parent",
  );
  await verifyDestination(paths);
}

function serialize(
  destination: string,
  write: () => Promise<string>,
): Promise<string> {
  const prior = writes.get(destination) ?? Promise.resolve(destination);
  const next = prior.catch(() => destination).then(write);
  writes.set(destination, next);
  void next
    .finally(() => {
      if (writes.get(destination) === next) writes.delete(destination);
    })
    .catch(() => undefined);
  return next;
}

export function queueRecommendationCandidates(
  candidates: RecommendationCandidate[],
): RecommendationCandidate[] {
  const seen = new Set<string>();
  return [...candidates].sort(compareCandidates).filter((candidate) => {
    const key = candidateKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function writeRecommendationCandidateQueue(
  root: string,
  candidates: RecommendationCandidate[],
): Promise<string> {
  const lockKey = resolve(root, "data", "review", "sync-candidates.json");
  return serialize(lockKey, async () => {
    const paths = await prepareQueuePaths(root);
    await verifyDestination(paths);
    const temporaryPath = resolve(
      paths.review.path,
      `.sync-candidates.json.${randomUUID()}.tmp`,
    );
    if (!pathWithin(paths.review.path, temporaryPath)) {
      throw new Error(
        "Recommendation candidate queue temporary path escapes review directory",
      );
    }
    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(queueRecommendationCandidates(candidates), null, 2)}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      await renameQueue(temporaryPath, paths.destination, () =>
        revalidatePaths(paths),
      );
    } catch (error: unknown) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
    return paths.destination;
  });
}
