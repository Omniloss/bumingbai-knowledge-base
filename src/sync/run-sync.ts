import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import {
  lstat,
  mkdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { RecommendationCandidate } from "./recommendation-parser.js";

const writes = new Map<string, Promise<string>>();

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
  const pathFromDirectory = relative(directory, path);
  return (
    pathFromDirectory === "" ||
    (!pathFromDirectory.startsWith(`..${sep}`) &&
      pathFromDirectory !== ".." &&
      !isAbsolute(pathFromDirectory))
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

async function directory(path: string, label: string): Promise<void> {
  const before = await existingStats(path);
  if (before?.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link`);
  }
  if (before !== undefined && !before.isDirectory()) {
    throw new Error(`${label} must be a directory`);
  }
  if (before === undefined) await mkdir(path);
  const after = await lstat(path);
  if (after.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link`);
  }
  if (!after.isDirectory()) throw new Error(`${label} must be a directory`);
}

async function queuePaths(root: string): Promise<{
  directory: string;
  destination: string;
}> {
  const rootPath = resolve(root);
  const rootStats = await existingStats(rootPath);
  if (rootStats?.isSymbolicLink()) {
    throw new Error(
      "Recommendation candidate queue root must not be a symbolic link",
    );
  }
  if (rootStats === undefined || !rootStats.isDirectory()) {
    throw new Error("Recommendation candidate queue root must be a directory");
  }
  const rootRealPath = await realpath(rootPath);
  const dataPath = resolve(rootPath, "data");
  await directory(dataPath, "Recommendation candidate queue parent");
  const dataRealPath = await realpath(dataPath);
  if (!pathWithin(rootRealPath, dataRealPath)) {
    throw new Error("Recommendation candidate queue parent escapes root");
  }
  const reviewPath = resolve(dataPath, "review");
  await directory(reviewPath, "Recommendation candidate queue parent");
  const reviewRealPath = await realpath(reviewPath);
  if (!pathWithin(rootRealPath, reviewRealPath)) {
    throw new Error("Recommendation candidate queue parent escapes root");
  }
  return {
    directory: reviewPath,
    destination: resolve(reviewPath, "sync-candidates.json"),
  };
}

async function verifyDestination(
  destination: string,
  directoryPath: string,
): Promise<void> {
  const stats = await existingStats(destination);
  if (stats?.isSymbolicLink()) {
    throw new Error(
      "Recommendation candidate queue destination must not be a symbolic link",
    );
  }
  if (stats !== undefined && !stats.isFile()) {
    throw new Error(
      "Recommendation candidate queue destination must be a file",
    );
  }
  const directoryRealPath = await realpath(directoryPath);
  if (!pathWithin(directoryRealPath, destination)) {
    throw new Error(
      "Recommendation candidate queue destination escapes review directory",
    );
  }
}

function serialize(
  destination: string,
  write: () => Promise<string>,
): Promise<string> {
  const prior = writes.get(destination) ?? Promise.resolve(destination);
  const next = prior.catch(() => destination).then(write);
  writes.set(destination, next);
  void next.then(
    () => {
      if (writes.get(destination) === next) writes.delete(destination);
    },
    () => {
      if (writes.get(destination) === next) writes.delete(destination);
    },
  );
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

export async function writeRecommendationCandidateQueue(
  root: string,
  candidates: RecommendationCandidate[],
): Promise<string> {
  const paths = await queuePaths(root);
  return serialize(paths.destination, async () => {
    await verifyDestination(paths.destination, paths.directory);
    const temporaryPath = resolve(
      paths.directory,
      `.sync-candidates.json.${randomUUID()}.tmp`,
    );
    if (!pathWithin(paths.directory, temporaryPath)) {
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
      await verifyDestination(paths.destination, paths.directory);
      await rename(temporaryPath, paths.destination);
    } catch (error: unknown) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
    return paths.destination;
  });
}
