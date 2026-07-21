import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Catalog } from "../domain/schemas/catalog.js";

type OutputEntry = {
  readonly path: string;
  readonly value: unknown;
};

function outputEntries(rootDir: string, catalog: Catalog): OutputEntry[] {
  return [
    {
      path: join(rootDir, "data", "catalog", "provider-records.json"),
      value: catalog.providerRecords,
    },
    {
      path: join(rootDir, "data", "catalog", "image-assets.json"),
      value: catalog.imageAssets,
    },
    {
      path: join(rootDir, "data", "catalog", "work-relations.json"),
      value: catalog.workRelations,
    },
    {
      path: join(rootDir, "data", "review", "issues.json"),
      value: catalog.reviewIssues,
    },
  ];
}

export async function writeEnrichmentOutputs(
  rootDir: string,
  catalog: Catalog,
): Promise<void> {
  const entries = outputEntries(rootDir, catalog);
  const transactionId = randomUUID();
  const temporary = entries.map((entry, index) => ({
    ...entry,
    tempPath: join(dirname(entry.path), `.${transactionId}.${index}.tmp`),
  }));
  const originals = new Map<string, string>();

  try {
    for (const entry of temporary) {
      await mkdir(dirname(entry.path), { recursive: true });
      originals.set(entry.path, await readFile(entry.path, "utf8"));
      await writeFile(
        entry.tempPath,
        `${JSON.stringify(entry.value, null, 2)}\n`,
        "utf8",
      );
    }
    const published: string[] = [];
    try {
      for (const entry of temporary) {
        await rename(entry.tempPath, entry.path);
        published.push(entry.path);
      }
    } catch (error: unknown) {
      for (const path of published) {
        const original = originals.get(path);
        if (original !== undefined) await writeFile(path, original, "utf8");
      }
      throw error;
    }
  } finally {
    await Promise.all(
      temporary.map((entry) => rm(entry.tempPath, { force: true })),
    );
  }
}
