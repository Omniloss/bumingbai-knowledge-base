import { z } from "zod";
import { readProviderCache, writeProviderCache } from "../providers/cache.js";
import type {
  ProviderClient,
  ProviderResult,
  WorkLookup,
} from "../providers/types.js";
import { parseProviderResult } from "./provider-data.js";

function cacheKey(workId: string, fingerprint: string): string {
  return `${workId}-${fingerprint}`;
}

function safeProviderResult(
  client: ProviderClient<unknown>,
  input: unknown,
): ProviderResult<unknown> | undefined {
  try {
    return parseProviderResult(client.name, input);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) return undefined;
    throw error;
  }
}

export async function loadProviderResult(
  client: ProviderClient<unknown>,
  query: WorkLookup,
  fingerprint: string,
  options: { readonly cacheRoot: string; readonly offline?: boolean },
): Promise<ProviderResult<unknown> | undefined> {
  const key = cacheKey(query.workId, fingerprint);
  const cached = safeProviderResult(
    client,
    await readProviderCache(options.cacheRoot, client.name, key, z.unknown()),
  );
  if (options.offline) return cached;
  try {
    const fresh = parseProviderResult(client.name, await client.lookup(query));
    await writeProviderCache(options.cacheRoot, client.name, key, fresh);
    return fresh;
  } catch {
    return cached;
  }
}
