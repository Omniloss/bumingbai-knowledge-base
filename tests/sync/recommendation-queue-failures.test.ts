import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecommendationCandidate } from "../../src/sync/recommendation-parser.js";

type Control = {
  identityChanged: boolean;
  renameError: Error | undefined;
  renameErrors: Error[];
  renameAttempts: number;
  temporaryWriteError: Error | undefined;
  temporaryWritten: boolean;
};

type QueueWriter =
  typeof import("../../src/sync/run-sync.js").writeRecommendationCandidateQueue;

function createControl(): Control {
  return {
    identityChanged: false,
    renameError: undefined,
    renameErrors: [],
    renameAttempts: 0,
    temporaryWriteError: undefined,
    temporaryWritten: false,
  };
}

async function queueWriter(control: Control): Promise<QueueWriter> {
  vi.resetModules();
  vi.doMock("node:fs/promises", async (importOriginal) => {
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
          return Object.create(stats, { ino: { value: ino } });
        }
        return stats;
      },
      rename: async (...args: Parameters<typeof original.rename>) => {
        const temporary = String(args[0]).replaceAll("\\", "/");
        const destination = String(args[1]).replaceAll("\\", "/");
        const publishesQueue =
          temporary.endsWith(".tmp") &&
          destination.endsWith("/sync-candidates.json");
        if (publishesQueue) {
          control.renameAttempts += 1;
          const error = control.renameErrors.shift() ?? control.renameError;
          if (error !== undefined) throw error;
        }
        return original.rename(...args);
      },
      writeFile: async (...args: Parameters<typeof original.writeFile>) => {
        const path = String(args[0]);
        if (
          control.temporaryWriteError !== undefined &&
          path.endsWith(".tmp")
        ) {
          throw control.temporaryWriteError;
        }
        const result = await original.writeFile(...args);
        if (path.endsWith(".tmp")) control.temporaryWritten = true;
        return result;
      },
    };
  });
  return (await import("../../src/sync/run-sync.js"))
    .writeRecommendationCandidateQueue;
}

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
  vi.doUnmock("node:fs/promises");
  vi.resetModules();
});

describe("recommendation queue failure handling", () => {
  it("cleans a failed temporary write and preserves the destination", async () => {
    const control = createControl();
    const writeRecommendationCandidateQueue = await queueWriter(control);
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
    const control = createControl();
    const writeRecommendationCandidateQueue = await queueWriter(control);
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
    expect(control.renameAttempts).toBe(1);
  });

  it.runIf(process.platform === "win32")(
    "publishes after one transient Windows rename EPERM",
    async () => {
      const control = createControl();
      const writeRecommendationCandidateQueue = await queueWriter(control);
      const root = await mkdtemp(join(tmpdir(), "bumingbai-candidates-"));
      const target = await destination(root);
      control.renameErrors = [
        Object.assign(new Error("simulated Windows rename EPERM"), {
          code: "EPERM",
        }),
      ];

      await expect(
        writeRecommendationCandidateQueue(root, [candidate()]),
      ).resolves.toBe(target.path);
      expect(control.renameAttempts).toBe(2);
      await expect(readFile(target.path, "utf8")).resolves.toContain("《A》");
    },
  );

  it.runIf(process.platform === "win32")(
    "fails and cleans up after bounded persistent Windows rename EPERM",
    async () => {
      const control = createControl();
      const writeRecommendationCandidateQueue = await queueWriter(control);
      const root = await mkdtemp(join(tmpdir(), "bumingbai-candidates-"));
      const target = await destination(root);
      const error = Object.assign(new Error("simulated Windows rename EPERM"), {
        code: "EPERM",
      });
      control.renameErrors = [error, error, error];

      await expect(
        writeRecommendationCandidateQueue(root, [candidate()]),
      ).rejects.toBe(error);
      expect(control.renameAttempts).toBe(3);
      await expect(readFile(target.path, "utf8")).resolves.toBe(
        "previous queue",
      );
      await expect(readdir(target.directory)).resolves.toEqual([
        "sync-candidates.json",
      ]);
    },
  );

  it("fails closed and cleans up when parent identity changes before rename", async () => {
    const control = createControl();
    const writeRecommendationCandidateQueue = await queueWriter(control);
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
