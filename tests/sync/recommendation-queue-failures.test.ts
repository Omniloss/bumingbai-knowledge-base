import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecommendationCandidate } from "../../src/sync/recommendation-parser.js";

const control = vi.hoisted(() => ({
  identityChanged: false,
  renameError: undefined as Error | undefined,
  temporaryWriteError: undefined as Error | undefined,
  temporaryWritten: false,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    lstat: async (...args: Parameters<typeof original.lstat>) => {
      const stats = await original.lstat(...args);
      const path = String(args[0]).replaceAll("\\", "/");
      if (
        control.identityChanged &&
        control.temporaryWritten &&
        path.endsWith("/data/review")
      ) {
        const ino =
          typeof stats.ino === "bigint" ? stats.ino + 1n : stats.ino + 1;
        return Object.assign(Object.create(stats), { ino });
      }
      return stats;
    },
    rename: async (...args: Parameters<typeof original.rename>) => {
      if (control.renameError !== undefined) throw control.renameError;
      return original.rename(...args);
    },
    writeFile: async (...args: Parameters<typeof original.writeFile>) => {
      const path = String(args[0]);
      if (
        control.temporaryWriteError !== undefined &&
        path.includes(".sync-candidates.json.")
      ) {
        throw control.temporaryWriteError;
      }
      const result = await original.writeFile(...args);
      if (path.includes(".sync-candidates.json."))
        control.temporaryWritten = true;
      return result;
    },
  };
});

import { writeRecommendationCandidateQueue } from "../../src/sync/run-sync.js";

function candidate(): RecommendationCandidate {
  return {
    episodeNumber: 223,
    rawText: "《A》",
    sourceUrl: "https://bumingbai.net/episodes/ep-223/",
    retrievedAt: "2026-07-18T00:00:00.000Z",
    locator: "html > body > p:nth-of-type(1)",
    risk: "high",
    status: "pending_verification",
  };
}

async function destination(
  root: string,
): Promise<{ directory: string; path: string }> {
  const directory = join(root, "data", "review");
  const path = join(directory, "sync-candidates.json");
  await mkdir(directory, { recursive: true });
  await writeFile(path, "previous queue", "utf8");
  return { directory, path };
}

afterEach(() => {
  control.identityChanged = false;
  control.renameError = undefined;
  control.temporaryWriteError = undefined;
  control.temporaryWritten = false;
});

describe("recommendation queue failure handling", () => {
  it("cleans a failed temporary write and preserves the destination", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-candidates-"));
    const target = await destination(root);
    const error = new Error("simulated temporary write failure");
    control.temporaryWriteError = error;

    await expect(
      writeRecommendationCandidateQueue(root, [candidate()]),
    ).rejects.toBe(error);
    await expect(readFile(target.path, "utf8")).resolves.toBe("previous queue");
    await expect(readdir(target.directory)).resolves.toEqual([
      "sync-candidates.json",
    ]);
  });

  it("cleans a temporary file when rename fails after its creation", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-candidates-"));
    const target = await destination(root);
    const error = new Error("simulated rename failure");
    control.renameError = error;

    await expect(
      writeRecommendationCandidateQueue(root, [candidate()]),
    ).rejects.toBe(error);
    await expect(readFile(target.path, "utf8")).resolves.toBe("previous queue");
    await expect(readdir(target.directory)).resolves.toEqual([
      "sync-candidates.json",
    ]);
  });

  it("fails closed and cleans up when parent identity changes before rename", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-candidates-"));
    const target = await destination(root);
    control.identityChanged = true;

    await expect(
      writeRecommendationCandidateQueue(root, [candidate()]),
    ).rejects.toThrow("Recommendation candidate queue parent identity changed");
    await expect(readFile(target.path, "utf8")).resolves.toBe("previous queue");
    await expect(readdir(target.directory)).resolves.toEqual([
      "sync-candidates.json",
    ]);
  });
});
