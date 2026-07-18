import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runBuild } from "./build-process.js";
import {
  scanPublicArtifact,
  scanPublicDirectory,
} from "./public-artifact-scan.js";

export const NONPUBLIC_SENTINEL = "__NONPUBLIC_SYNC_CANDIDATE_7f629d__";

type GateOptions = {
  root?: string;
  runBuild?: () => Promise<void>;
  buildTimeoutMilliseconds?: number;
};

const defaultBuildTimeoutMilliseconds = 120_000;

async function assertAbsent(root: string): Promise<void> {
  const sentinel = Buffer.from(NONPUBLIC_SENTINEL);
  await scanPublicDirectory(join(root, "dist"), sentinel);
  await scanPublicArtifact(join(root, "public", "search-index.json"), sentinel);
}

function queueCandidates(originalQueue: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(originalQueue);
  } catch {
    throw new Error("Recommendation candidate queue must contain valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Recommendation candidate queue must be a JSON array");
  }
  return parsed;
}

export async function runPublicIsolationGate(
  options: GateOptions = {},
): Promise<void> {
  const root = options.root ?? process.cwd();
  const queuePath = join(root, "data", "review", "sync-candidates.json");
  const originalQueue = await readFile(queuePath, "utf8");
  const candidates = queueCandidates(originalQueue);
  candidates.push({
    rawText: NONPUBLIC_SENTINEL,
    risk: "high",
    status: "pending_verification",
  });
  try {
    await writeFile(
      queuePath,
      `${JSON.stringify(candidates, null, 2)}\n`,
      "utf8",
    );
    await (options.runBuild?.() ??
      runBuild(
        root,
        options.buildTimeoutMilliseconds ?? defaultBuildTimeoutMilliseconds,
      ));
    await assertAbsent(root);
  } finally {
    await writeFile(queuePath, originalQueue, "utf8");
  }
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  import.meta.url === pathToFileURL(resolve(entryPath)).href
) {
  await runPublicIsolationGate();
}
