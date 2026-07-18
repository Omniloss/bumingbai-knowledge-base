import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NONPUBLIC_SENTINEL,
  runPublicIsolationGate,
} from "../../tools/check-public-isolation.js";

async function createRoot(): Promise<{ root: string; queuePath: string }> {
  const root = await mkdtemp(join(tmpdir(), "bumingbai-public-isolation-"));
  const queuePath = join(root, "data", "review", "sync-candidates.json");
  await mkdir(join(root, "data", "review"), { recursive: true });
  await writeFile(queuePath, "[]\n", "utf8");
  return { root, queuePath };
}

function environmentValue(name: string): string | undefined {
  return process.env[name];
}

function runPackageGate(
  root: string,
  leak = false,
): Promise<{ code: number; output: string }> {
  const windows = process.platform === "win32";
  const command = windows ? (environmentValue("ComSpec") ?? "cmd.exe") : "pnpm";
  const args = windows
    ? ["/d", "/s", "/c", "pnpm.cmd run build:public-isolation"]
    : ["run", "build:public-isolation"];
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...(leak ? { ISOLATION_LEAK: "1" } : {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      resolveResult({ code: code ?? -1, output });
    });
  });
}

async function createMinimalProject(): Promise<{
  root: string;
  queuePath: string;
}> {
  const { root, queuePath } = await createRoot();
  const tool = resolve(
    process.cwd(),
    "tools",
    "check-public-isolation.ts",
  ).replaceAll("\\", "/");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      scripts: {
        build: "node build.mjs",
        "build:public-isolation": `bun run ${tool}`,
      },
    }),
    "utf8",
  );
  await writeFile(
    join(root, "build.mjs"),
    `import { mkdir, readFile, writeFile } from "node:fs/promises";
const sentinel = ${JSON.stringify(NONPUBLIC_SENTINEL)};
if (!(await readFile("data/review/sync-candidates.json", "utf8")).includes(sentinel)) process.exit(2);
await mkdir("dist/nested", { recursive: true });
await mkdir("public", { recursive: true });
await writeFile("dist/build-ran.txt", "injected queue observed", "utf8");
await writeFile("public/search-index.json", "[]\\n", "utf8");
if (process.env.ISOLATION_LEAK) await writeFile("dist/nested/bundle.js", sentinel, "utf8");`,
    "utf8",
  );
  return { root, queuePath };
}

describe("runPublicIsolationGate", () => {
  it("injects the sentinel only during its build and restores the queue", async () => {
    const { root, queuePath } = await createRoot();
    await mkdir(join(root, "dist"), { recursive: true });
    await mkdir(join(root, "public"), { recursive: true });

    await runPublicIsolationGate({
      root,
      runBuild: async () => {
        await expect(readFile(queuePath, "utf8")).resolves.toContain(
          NONPUBLIC_SENTINEL,
        );
        await writeFile(join(root, "dist", "index.html"), "public", "utf8");
        await writeFile(
          join(root, "public", "search-index.json"),
          "[]\n",
          "utf8",
        );
      },
    });

    await expect(readFile(queuePath, "utf8")).resolves.toBe("[]\n");
  });

  it("restores the queue when the injected build fails", async () => {
    const { root, queuePath } = await createRoot();

    await expect(
      runPublicIsolationGate({
        root,
        runBuild: async () => {
          throw new Error("expected build failure");
        },
      }),
    ).rejects.toThrow("expected build failure");

    await expect(readFile(queuePath, "utf8")).resolves.toBe("[]\n");
  });

  it.each([
    [
      "{not valid json",
      "Recommendation candidate queue must contain valid JSON",
    ],
    ["{}", "Recommendation candidate queue must be a JSON array"],
  ])("fails closed for an invalid queue without echoing it", async (queue, message) => {
    const { root, queuePath } = await createRoot();
    await writeFile(queuePath, queue, "utf8");

    let caught: unknown;
    try {
      await runPublicIsolationGate({ root });
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    if (!(caught instanceof Error)) throw new Error("Expected queue error");
    expect(caught.message).toBe(message);
    expect(caught.message).not.toContain(queue);
    await expect(readFile(queuePath, "utf8")).resolves.toBe(queue);
  });

  it("rejects a binary-safe sentinel leak from a generated JavaScript asset", async () => {
    const { root, queuePath } = await createRoot();
    await mkdir(join(root, "dist", "nested"), { recursive: true });
    await mkdir(join(root, "public"), { recursive: true });

    await expect(
      runPublicIsolationGate({
        root,
        runBuild: async () => {
          await writeFile(
            join(root, "dist", "nested", "bundle.js"),
            Buffer.concat([
              Buffer.from([0, 255]),
              Buffer.from(NONPUBLIC_SENTINEL),
            ]),
          );
          await writeFile(
            join(root, "public", "search-index.json"),
            "[]\n",
            "utf8",
          );
        },
      }),
    ).rejects.toThrow(
      "Nonpublic recommendation sentinel leaked into public output",
    );

    await expect(readFile(queuePath, "utf8")).resolves.toBe("[]\n");
  });

  it("runs the package entrypoint, scans output, and restores the queue", async () => {
    const { root, queuePath } = await createMinimalProject();

    const success = await runPackageGate(root);

    expect(success.code).toBe(0);
    await expect(
      readFile(join(root, "dist", "build-ran.txt"), "utf8"),
    ).resolves.toBe("injected queue observed");
    await expect(readFile(queuePath, "utf8")).resolves.toBe("[]\n");

    const leak = await runPackageGate(root, true);

    expect(leak.code).not.toBe(0);
    expect(leak.output).toContain(
      "Nonpublic recommendation sentinel leaked into public output",
    );
    await expect(readFile(queuePath, "utf8")).resolves.toBe("[]\n");
  });
});
