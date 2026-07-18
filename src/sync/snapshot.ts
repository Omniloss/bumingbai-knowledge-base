import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { IsoDateSchema } from "../domain/schemas/primitives.js";
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

function pathWithin(directory: string, path: string): boolean {
  const pathFromDirectory = relative(directory, path);
  return (
    pathFromDirectory !== "" &&
    pathFromDirectory !== ".." &&
    !pathFromDirectory.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromDirectory)
  );
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
  if (!IsoDateSchema.safeParse(retrievedAt).success) {
    throw new Error(
      "Official snapshot retrievedAt must be a strict ISO datetime",
    );
  }

  const directory = resolve(root, "data", "raw", "official");
  const filename = `${retrievedAt.replaceAll(":", "-")}-${contentHash(snapshot)}.json`;
  const path = resolve(directory, filename);
  const temporaryPath = resolve(directory, `.${filename}.tmp`);
  if (!pathWithin(directory, path) || !pathWithin(directory, temporaryPath)) {
    throw new Error("Official snapshot path must remain within its directory");
  }

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
