import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { OfficialEpisodeSnapshot } from "./types.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left === right ? 0 : left < right ? -1 : 1))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function contentHash(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value)) ?? "undefined";
  return createHash("sha256").update(serialized).digest("hex");
}

export async function writeSnapshot(
  root: string,
  snapshot: OfficialEpisodeSnapshot[],
): Promise<string> {
  const retrievedAt = snapshot[0]?.retrievedAt;
  if (retrievedAt === undefined) {
    throw new Error("Official snapshot must contain at least one episode");
  }
  if (snapshot.some((episode) => episode.retrievedAt !== retrievedAt)) {
    throw new Error("Official snapshot must have one retrievedAt value");
  }

  const directory = join(root, "data", "raw", "official");
  const filename = `${retrievedAt.replaceAll(":", "-")}-${contentHash(snapshot)}.json`;
  const path = join(directory, filename);
  const temporaryPath = join(directory, `.${filename}.tmp`);

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(snapshot, null, 2)}\n`,
      "utf8",
    );
    await rename(temporaryPath, path);
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return path;
}
