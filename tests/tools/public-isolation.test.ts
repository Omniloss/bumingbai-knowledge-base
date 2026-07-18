import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("rejects a sentinel leak from a generated public artifact", async () => {
    const { root, queuePath } = await createRoot();
    await mkdir(join(root, "dist", "nested"), { recursive: true });
    await mkdir(join(root, "public"), { recursive: true });

    await expect(
      runPublicIsolationGate({
        root,
        runBuild: async () => {
          await writeFile(
            join(root, "dist", "nested", "leak.html"),
            NONPUBLIC_SENTINEL,
            "utf8",
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
});
