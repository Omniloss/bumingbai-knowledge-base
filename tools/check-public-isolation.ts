import { spawn } from "node:child_process";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const NONPUBLIC_SENTINEL = "__NONPUBLIC_SYNC_CANDIDATE_7f629d__";

type GateOptions = {
  root?: string;
  runBuild?: () => Promise<void>;
  buildTimeoutMilliseconds?: number;
};

const defaultBuildTimeoutMilliseconds = 120_000;

function stop(child: ReturnType<typeof spawn>): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.unref();
    return;
  }
  child.kill();
}

function run(root: string, timeoutMilliseconds: number): Promise<void> {
  const windows = process.platform === "win32";
  const command = windows ? "cmd.exe" : "pnpm";
  const args = windows
    ? ["/d", "/s", "/c", "pnpm.cmd run build"]
    : ["run", "build"];
  return new Promise((resolveRun, rejectRun) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      stop(child);
      finish(() =>
        rejectRun(
          new Error(`pnpm run build timed out after ${timeoutMilliseconds}ms`),
        ),
      );
    }, timeoutMilliseconds);
    child.once("error", (error) => finish(() => rejectRun(error)));
    child.once("exit", (code) =>
      finish(() => {
        if (code === 0) resolveRun();
        else
          rejectRun(
            new Error(`pnpm run build exited with ${code ?? "no code"}`),
          );
      }),
    );
  });
}

async function scanDeployedDirectory(
  directory: string,
  sentinel: Buffer,
): Promise<void> {
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("Public output contains a nonregular entry");
  }
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scanDeployedDirectory(path, sentinel);
    else if (entry.isFile()) {
      if ((await readFile(path)).includes(sentinel)) {
        throw new Error(
          "Nonpublic recommendation sentinel leaked into public output",
        );
      }
    } else throw new Error("Public output contains a nonregular entry");
  }
}

async function assertAbsent(root: string): Promise<void> {
  const sentinel = Buffer.from(NONPUBLIC_SENTINEL);
  await scanDeployedDirectory(join(root, "dist"), sentinel);
  if (
    (await readFile(join(root, "public", "search-index.json"))).includes(
      sentinel,
    )
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
