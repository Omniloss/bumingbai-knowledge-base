import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecommendationCandidate } from "../../src/sync/recommendation-parser.js";

const control = vi.hoisted(() => ({
  delayedRawText: undefined as string | undefined,
  onDelayedWrite: undefined as (() => void) | undefined,
  waitForDelayedWrite: undefined as Promise<void> | undefined,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    writeFile: async (...args: Parameters<typeof original.writeFile>) => {
      const [, data] = args;
      if (
        control.delayedRawText !== undefined &&
        String(data).includes(control.delayedRawText)
      ) {
        control.onDelayedWrite?.();
        await control.waitForDelayedWrite;
      }
      return original.writeFile(...args);
    },
  };
});

import { writeRecommendationCandidateQueue } from "../../src/sync/run-sync.js";

const retrievedAt = "2026-07-18T00:00:00.000Z";

function candidate(
  overrides: Partial<RecommendationCandidate> = {},
): RecommendationCandidate {
  return {
    episodeNumber: 223,
    rawText: "《A》",
    sourceUrl: "https://bumingbai.net/episodes/ep-223/",
    locator: "html > body > p:nth-of-type(1)",
    retrievedAt,
    risk: "high",
    status: "pending_verification",
    ...overrides,
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => {
      if (resolvePromise === undefined) throw new Error("Deferred not ready");
      resolvePromise();
    },
  };
}

function symlinkPrivilegeError(error: unknown): boolean {
  return (
    process.platform === "win32" &&
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "EPERM" || error.code === "EACCES")
  );
}

async function createSymlink(
  target: string,
  path: string,
  type: "file" | "junction",
  context: { skip: (reason?: string) => void },
): Promise<boolean> {
  try {
    await symlink(target, path, type);
    return true;
  } catch (error: unknown) {
    if (symlinkPrivilegeError(error)) {
      context.skip("Windows denied symbolic-link privilege");
      return false;
    }
    throw error;
  }
}

afterEach(() => {
  control.delayedRawText = undefined;
  control.onDelayedWrite = undefined;
  control.waitForDelayedWrite = undefined;
});

describe("writeRecommendationCandidateQueue", () => {
  it("does not reuse a predictable temporary filename", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-candidates-"));
    const reviewDirectory = join(root, "data", "review");
    const sentinel = join(reviewDirectory, ".sync-candidates.json.tmp");
    await mkdir(reviewDirectory, { recursive: true });
    await writeFile(sentinel, "sentinel", "utf8");

    await writeRecommendationCandidateQueue(root, [candidate()]);

    await expect(readFile(sentinel, "utf8")).resolves.toBe("sentinel");
  });

  it("serializes overlapping writers so the later caller owns the final queue", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-candidates-"));
    const pause = deferred();
    const started = deferred();
    control.delayedRawText = "《first》";
    control.onDelayedWrite = started.resolve;
    control.waitForDelayedWrite = pause.promise;

    const first = writeRecommendationCandidateQueue(root, [
      candidate({ rawText: "《first》" }),
    ]);
    await started.promise;
    const second = writeRecommendationCandidateQueue(root, [
      candidate({ rawText: "《second》" }),
    ]);
    pause.resolve();
    await Promise.all([first, second]);

    await expect(
      readFile(join(root, "data", "review", "sync-candidates.json"), "utf8"),
    ).resolves.toContain("《second》");
  });

  it("rejects a symlinked queue destination", async (context) => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-candidates-"));
    const outside = join(root, "outside.json");
    const reviewDirectory = join(root, "data", "review");
    const destination = join(reviewDirectory, "sync-candidates.json");
    await mkdir(reviewDirectory, { recursive: true });
    await writeFile(outside, "outside queue", "utf8");
    if (!(await createSymlink(outside, destination, "file", context))) return;

    await expect(
      writeRecommendationCandidateQueue(root, [candidate()]),
    ).rejects.toThrow(
      "Recommendation candidate queue destination must not be a symbolic link",
    );
    await expect(readFile(outside, "utf8")).resolves.toBe("outside queue");
  });

  it("rejects a symlinked queue parent", async (context) => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-candidates-"));
    const outside = await mkdtemp(join(tmpdir(), "bumingbai-outside-"));
    const dataDirectory = join(root, "data");
    if (!(await createSymlink(outside, dataDirectory, "junction", context)))
      return;

    await expect(
      writeRecommendationCandidateQueue(root, [candidate()]),
    ).rejects.toThrow(
      "Recommendation candidate queue parent must not be a symbolic link",
    );
    await expect(lstat(dataDirectory)).resolves.toMatchObject({
      isSymbolicLink: expect.any(Function),
    });
  });
});
