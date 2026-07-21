import { createHash } from "node:crypto";
import { z } from "zod";
import type { Catalog } from "../domain/schemas/catalog.js";
import { readProviderCache, writeProviderCache } from "../providers/cache.js";
import { WorkersAiConfigurationError } from "../providers/workers-ai.js";
import { embeddingText } from "./lookup.js";

const EmbeddingRecordSchema = z.object({
  model: z.string().min(1),
  normalizedHash: z.string().regex(/^[a-f0-9]{64}$/),
  vector: z.array(z.number().finite()).min(1),
});
type EmbeddingRecord = z.infer<typeof EmbeddingRecordSchema>;

export interface EmbeddingClient {
  readonly model: string;
  embed(texts: readonly string[]): Promise<number[][]>;
}

export type EmbeddingOptions = {
  readonly cacheRoot: string;
  readonly client?: EmbeddingClient;
  readonly forceRefresh?: boolean;
  readonly now: string;
  readonly offline?: boolean;
};

function fingerprint(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function validVectors(vectors: number[][], count: number): boolean {
  const dimension = vectors[0]?.length ?? 0;
  return (
    count > 0 &&
    vectors.length === count &&
    dimension > 0 &&
    vectors.every(
      (vector) =>
        vector.length === dimension &&
        vector.every((value) => Number.isFinite(value)),
    )
  );
}

export async function loadEmbeddingVectors(
  catalog: Catalog,
  options: EmbeddingOptions,
): Promise<ReadonlyMap<string, readonly number[]>> {
  const works = [...catalog.works].toSorted((left, right) =>
    left.id.localeCompare(right.id),
  );
  const texts = new Map(
    works.map((work) => [work.id, embeddingText(catalog, work)]),
  );
  const cached = new Map<string, EmbeddingRecord>();
  for (const work of works) {
    const result = await readProviderCache(
      options.cacheRoot,
      "workers_ai",
      work.id,
      EmbeddingRecordSchema,
    );
    const record = result?.records[0];
    if (record !== undefined) cached.set(work.id, record);
  }

  if (options.client === undefined || options.offline) {
    return new Map(
      [...cached].map(([workId, record]) => [workId, record.vector]),
    );
  }
  const pending = works.filter((work) => {
    const text = texts.get(work.id) ?? "";
    const record = cached.get(work.id);
    return (
      options.forceRefresh ||
      record === undefined ||
      record.model !== options.client?.model ||
      record.normalizedHash !== fingerprint(text)
    );
  });
  if (pending.length === 0) {
    return new Map(
      [...cached].map(([workId, record]) => [workId, record.vector]),
    );
  }

  let vectors: number[][];
  try {
    vectors = await options.client.embed(
      pending.map((work) => texts.get(work.id) ?? ""),
    );
  } catch (error: unknown) {
    if (error instanceof WorkersAiConfigurationError) throw error;
    return new Map(
      [...cached].map(([workId, record]) => [workId, record.vector]),
    );
  }
  if (!validVectors(vectors, pending.length)) {
    return new Map(
      [...cached].map(([workId, record]) => [workId, record.vector]),
    );
  }

  for (const [index, work] of pending.entries()) {
    const vector = vectors[index];
    if (vector === undefined) continue;
    const text = texts.get(work.id) ?? "";
    const record = {
      model: options.client.model,
      normalizedHash: fingerprint(text),
      vector,
    };
    await writeProviderCache(options.cacheRoot, "workers_ai", work.id, {
      provider: "workers_ai",
      retrievedAt: options.now,
      records: [record],
    });
    cached.set(work.id, record);
  }
  return new Map(
    [...cached].map(([workId, record]) => [workId, record.vector]),
  );
}
