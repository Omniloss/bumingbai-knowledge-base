import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { RecommendationCandidate } from "./recommendation-parser.js";

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
    compareText(left.locator, right.locator) ||
    compareText(left.recommenderLabel ?? "", right.recommenderLabel ?? "")
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
    pathFromDirectory !== "" &&
    pathFromDirectory !== ".." &&
    !pathFromDirectory.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromDirectory)
  );
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
  const directory = resolve(root, "data", "review");
  const path = resolve(directory, "sync-candidates.json");
  const temporaryPath = resolve(directory, ".sync-candidates.json.tmp");
  if (!pathWithin(directory, path) || !pathWithin(directory, temporaryPath)) {
    throw new Error(
      "Recommendation candidate queue path must remain within data/review",
    );
  }

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(queueRecommendationCandidates(candidates), null, 2)}\n`,
      "utf8",
    );
    await rename(temporaryPath, path);
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return path;
}
