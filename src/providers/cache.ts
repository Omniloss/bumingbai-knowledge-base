import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ProviderName, ProviderResult } from "./types.js";

const ProviderNameSchema = z.enum([
  "open_library",
  "tmdb",
  "wikidata",
  "commons",
  "workers_ai",
]);

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
  let content: string;

  try {
    content = await readFile(join(root, provider, `${key}.json`), "utf8");
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
  const directory = join(root, provider);
  const finalPath = join(directory, `${key}.json`);
  const tempPath = `${finalPath}.tmp`;
  const result = providerResultSchema(provider, z.unknown()).parse(value);

  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await rename(tempPath, finalPath);
}
