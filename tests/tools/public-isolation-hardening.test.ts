import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
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
});
