import { spawn } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const NONPUBLIC_SENTINEL = "__NONPUBLIC_SYNC_CANDIDATE_7f629d__";

type GateOptions = {
  root?: string;
  runBuild?: () => Promise<void>;
};

async function htmlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return htmlFiles(path);
      return entry.name.endsWith(".html") ? [path] : [];
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
  const files = await htmlFiles(join(root, "dist"));
  const outputs = await Promise.all([
    ...files.map((file) => readFile(file, "utf8")),
    readFile(join(root, "public", "search-index.json"), "utf8"),
  ]);
  if (outputs.some((output) => output.includes(NONPUBLIC_SENTINEL))) {
    throw new Error(
      "Nonpublic recommendation sentinel leaked into public output",
    );
  }
}

export async function runPublicIsolationGate(
  options: GateOptions = {},
): Promise<void> {
  const root = options.root ?? process.cwd();
  const queuePath = join(root, "data", "review", "sync-candidates.json");
  const originalQueue = await readFile(queuePath, "utf8");
  const candidates: unknown[] = JSON.parse(originalQueue) as unknown[];
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
  import.meta.url === new URL(`file:///${entryPath.replaceAll("\\", "/")}`).href
) {
  await runPublicIsolationGate();
}
