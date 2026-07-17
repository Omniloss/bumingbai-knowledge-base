import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import type { ProviderName, ProviderResult } from "./types.js";

const ProviderNameSchema = z.enum([
  "open_library",
  "tmdb",
  "wikidata",
  "commons",
  "workers_ai",
]);
const CacheKeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const pendingWrites = new Map<string, Promise<void>>();

function cachePaths(root: string, provider: ProviderName, key: string) {
  const safeProvider = ProviderNameSchema.parse(provider);
  const safeKey = CacheKeySchema.parse(key);
  const directory = resolve(root, safeProvider);
  const finalPath = resolve(directory, `${safeKey}.json`);
  const relativePath = relative(directory, finalPath);

  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error("Cache path must remain within its provider directory");
  }

  return { directory, finalPath, safeKey };
}

function providerResultSchema<T>(
  provider: ProviderName,
  recordSchema: z.ZodType<T>,
) {
  return z.object({
    provider: ProviderNameSchema.refine((value) => value === provider),
    retrievedAt: z.string(),
    records: z.array(recordSchema),
  });
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function parseJson(content: string): unknown {
  return JSON.parse(content);
}

function enqueueWrite(
  finalPath: string,
  write: () => Promise<void>,
): Promise<void> {
  const previous = pendingWrites.get(finalPath) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(write);

  pendingWrites.set(finalPath, current);
  current.then(
    () => {
      if (pendingWrites.get(finalPath) === current) {
        pendingWrites.delete(finalPath);
      }
    },
    () => {
      if (pendingWrites.get(finalPath) === current) {
        pendingWrites.delete(finalPath);
      }
    },
  );

  return current;
}

async function publishCacheEntry(
  tempPath: string,
  finalPath: string,
): Promise<void> {
  try {
    await rename(tempPath, finalPath);
  } catch (renameError: unknown) {
    const existingEntry = await lstat(finalPath).catch(
      (statError: unknown): never => {
        if (isMissingFile(statError)) throw renameError;
        throw statError;
      },
    );

    if (!existingEntry.isFile()) throw renameError;
    await rm(finalPath);
    await rename(tempPath, finalPath);
  }
}

export async function readProviderCache<T>(
  root: string,
  provider: ProviderName,
  key: string,
  recordSchema: z.ZodType<T>,
): Promise<ProviderResult<T> | undefined>;
export async function readProviderCache(
  root: string,
  provider: ProviderName,
  key: string,
): Promise<ProviderResult<unknown> | undefined>;
export async function readProviderCache(
  root: string,
  provider: ProviderName,
  key: string,
  recordSchema: z.ZodType<unknown> = z.unknown(),
): Promise<ProviderResult<unknown> | undefined> {
  const { finalPath } = cachePaths(root, provider, key);
  let content: string;

  try {
    content = await readFile(finalPath, "utf8");
  } catch (error: unknown) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }

  try {
    const result = providerResultSchema(provider, recordSchema).safeParse(
      parseJson(content),
    );

    return result.success ? result.data : undefined;
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export async function writeProviderCache<T>(
  root: string,
  provider: ProviderName,
  key: string,
  value: ProviderResult<T>,
): Promise<void> {
  const { directory, finalPath, safeKey } = cachePaths(root, provider, key);
  const result = providerResultSchema(provider, z.unknown()).parse(value);

  await mkdir(directory, { recursive: true });
  return enqueueWrite(finalPath, async () => {
    const tempPath = join(directory, `.${safeKey}.${randomUUID()}.tmp`);

    try {
      await writeFile(tempPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      await publishCacheEntry(tempPath, finalPath);
    } catch (error: unknown) {
      await rm(tempPath, { force: true });
      throw error;
    }
  });
}
