import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runPublicIsolationGate } from "../../tools/check-public-isolation.js";

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bumingbai-public-isolation-"));
  await mkdir(join(root, "data", "review"), { recursive: true });
  await writeFile(join(root, "data", "review", "sync-candidates.json"), "[]\n");
  return root;
}

it("rejects a deployed output junction instead of following it", async () => {
  const root = await createRoot();
  const outside = join(root, "outside");
  await mkdir(outside);
  await symlink(outside, join(root, "dist"), "junction");
  await mkdir(join(root, "public"));
  await writeFile(join(root, "public", "search-index.json"), "[]\n");

  await expect(
    runPublicIsolationGate({ root, runBuild: async () => undefined }),
  ).rejects.toThrow("Public output contains a nonregular entry");
});

it("stops a timed-out build process", async () => {
  const root = await createRoot();
  await mkdir(join(root, "dist"));
  await mkdir(join(root, "public"));
  await writeFile(join(root, "public", "search-index.json"), "[]\n");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ scripts: { build: "node build.mjs" } }),
  );
  await writeFile(
    join(root, "build.mjs"),
    "await new Promise((resolve) => setTimeout(resolve, 100));",
  );

  await expect(
    runPublicIsolationGate({ root, buildTimeoutMilliseconds: 20 }),
  ).rejects.toThrow("timed out after 20ms");
}, 30_000);

it("terminates a timed-out build descendant before restoring the queue", async () => {
  const root = await createRoot();
  const marker = join(root, "descendant-marker");
  const queue = join(root, "data", "review", "sync-candidates.json");
  await mkdir(join(root, "dist"));
  await mkdir(join(root, "public"));
  await writeFile(join(root, "public", "search-index.json"), "[]\n");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ scripts: { build: "node build.mjs" } }),
  );
  const writer = `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marker)}, "orphan"), 12000)`;
  await writeFile(
    join(root, "build.mjs"),
    `import { spawn } from "node:child_process";
spawn(process.execPath, ["-e", ${JSON.stringify(writer)}], { stdio: "ignore" });
await new Promise(() => {});`,
  );

  await expect(
    runPublicIsolationGate({ root, buildTimeoutMilliseconds: 500 }),
  ).rejects.toThrow("timed out after 500ms");
  await expect(readFile(queue, "utf8")).resolves.toBe("[]\n");
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 12500));
  await expect(access(marker)).rejects.toThrow();
}, 30_000);

it("rejects a nonregular public search index", async () => {
  const root = await createRoot();
  const outside = join(root, "outside");
  await mkdir(join(root, "dist"));
  await mkdir(join(root, "public"));
  await mkdir(outside);
  await symlink(outside, join(root, "public", "search-index.json"), "junction");

  await expect(
    runPublicIsolationGate({ root, runBuild: async () => undefined }),
  ).rejects.toThrow("Public output contains a nonregular entry");
});

it("finds a sentinel split across artifact scan chunks", async () => {
  const root = await createRoot();
  await mkdir(join(root, "dist"));
  await mkdir(join(root, "public"));
  await writeFile(join(root, "public", "search-index.json"), "[]\n");
  await writeFile(
    join(root, "dist", "boundary.bin"),
    Buffer.concat([
      Buffer.alloc(64 * 1024 - 10),
      Buffer.from("__NONPUBLIC_SYNC_CANDIDATE_7f629d__"),
    ]),
  );

  await expect(
    runPublicIsolationGate({ root, runBuild: async () => undefined }),
  ).rejects.toThrow(
    "Nonpublic recommendation sentinel leaked into public output",
  );
});
