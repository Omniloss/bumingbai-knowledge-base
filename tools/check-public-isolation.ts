import { spawn } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const NONPUBLIC_SENTINEL = "__NONPUBLIC_SYNC_CANDIDATE_7f629d__";

type GateOptions = {
  root?: string;
  runBuild?: () => Promise<void>;
};

async function deployedFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return deployedFiles(path);
      return entry.isFile() ? [path] : [];
    }),
  );
  return files.flat();
}

function run(command: string, args: string[], root: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${command} ${args.join(" ")} exited with ${code ?? "no code"}`,
          ),
        );
    });
  });
}

async function assertAbsent(root: string): Promise<void> {
  const files = await deployedFiles(join(root, "dist"));
  const outputs = await Promise.all([
    ...files.map((file) => readFile(file)),
    readFile(join(root, "public", "search-index.json")),
  ]);
  if (
    outputs.some((output) => output.includes(Buffer.from(NONPUBLIC_SENTINEL)))
  ) {
    throw new Error(
      "Nonpublic recommendation sentinel leaked into public output",
    );
  }
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
      run(
        process.platform === "win32" ? "pnpm.cmd" : "pnpm",
        ["run", "build"],
        root,
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
