import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { BuildCleanupUnconfirmedError } from "../../tools/build-process.js";
import {
  PublicIsolationRecoveryRequiredError,
  runPublicIsolationGate,
} from "../../tools/check-public-isolation.js";
import {
  createQueueRecovery,
  type PublicIsolationRecoveryCleanupError,
  restoreQueueAndRemoveRecovery,
} from "../../tools/public-isolation-recovery.js";

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bumingbai-public-isolation-"));
  await mkdir(join(root, "data", "review"), { recursive: true });
  await writeFile(join(root, "data", "review", "sync-candidates.json"), "[]\n");
  return root;
}

it("does not overwrite a dynamically replaced queue file", async () => {
  const root = await createRoot();
  const queue = join(root, "data", "review", "sync-candidates.json");
  const replacement = join(root, "data", "review", "replacement.json");

  let failure: unknown;
  try {
    await runPublicIsolationGate({
      root,
      runBuild: async () => {
        await writeFile(replacement, '["replacement"]\n');
        await rename(replacement, queue);
      },
    });
  } catch (error: unknown) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(PublicIsolationRecoveryRequiredError);
  if (!(failure instanceof PublicIsolationRecoveryRequiredError)) {
    throw new Error("Expected a recovery-required isolation failure");
  }
  expect(failure.message).toContain(
    "Recommendation candidate queue destination identity changed",
  );
  await expect(readFile(queue, "utf8")).resolves.toBe('["replacement"]\n');
  await expect(readFile(failure.recoveryPath, "utf8")).resolves.toBe("[]\n");
  await rm(dirname(failure.recoveryPath), { force: true, recursive: true });
});

it("does not write restoration bytes after the review directory is swapped", async () => {
  const root = await createRoot();
  const review = join(root, "data", "review");
  const movedReview = join(root, "moved-review");
  const replacementQueue = join(review, "sync-candidates.json");

  let failure: unknown;
  try {
    await runPublicIsolationGate({
      root,
      runBuild: async () => {
        await rename(review, movedReview);
        await mkdir(review);
        await writeFile(replacementQueue, '["replacement"]\n');
      },
    });
  } catch (error: unknown) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(PublicIsolationRecoveryRequiredError);
  if (!(failure instanceof PublicIsolationRecoveryRequiredError)) {
    throw new Error("Expected a recovery-required isolation failure");
  }
  expect(failure.message).toContain(
    "Recommendation candidate queue parent identity changed",
  );
  await expect(readFile(replacementQueue, "utf8")).resolves.toBe(
    '["replacement"]\n',
  );
  await expect(readdir(review)).resolves.toEqual(["sync-candidates.json"]);
  await expect(readFile(failure.recoveryPath, "utf8")).resolves.toBe("[]\n");
  await rm(dirname(failure.recoveryPath), { force: true, recursive: true });
});

it("rejects invalid UTF-8 without changing the original queue bytes", async () => {
  const root = await createRoot();
  const queue = join(root, "data", "review", "sync-candidates.json");
  const original = Buffer.from([91, 34, 255, 34, 93, 10]);
  await writeFile(queue, original);

  await expect(
    runPublicIsolationGate({ root, runBuild: async () => undefined }),
  ).rejects.toThrow("Recommendation candidate queue must contain valid JSON");

  await expect(readFile(queue)).resolves.toEqual(original);
});

it("restores valid noncanonical JSON bytes exactly", async () => {
  const root = await createRoot();
  const queue = join(root, "data", "review", "sync-candidates.json");
  const original = Buffer.from(" [ ] \r\n");
  await mkdir(join(root, "dist"));
  await mkdir(join(root, "public"));
  await writeFile(join(root, "public", "search-index.json"), "[]\n");
  await writeFile(queue, original);

  await runPublicIsolationGate({ root, runBuild: async () => undefined });

  await expect(readFile(queue)).resolves.toEqual(original);
});

it("quarantines the original queue when process cleanup is unconfirmed", async () => {
  const root = await createRoot();
  const queue = join(root, "data", "review", "sync-candidates.json");
  const original = Buffer.from('[{"rawText":"private candidate"}]\n');
  await writeFile(queue, original);

  let failure: unknown;
  try {
    await runPublicIsolationGate({
      root,
      runBuild: async () => {
        throw new BuildCleanupUnconfirmedError(new Error("inspection failed"));
      },
    });
  } catch (error: unknown) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(PublicIsolationRecoveryRequiredError);
  if (!(failure instanceof PublicIsolationRecoveryRequiredError)) {
    throw new Error("Expected a recovery-required isolation failure");
  }

  await expect(readFile(queue, "utf8")).resolves.toContain(
    "__NONPUBLIC_SYNC_CANDIDATE_7f629d__",
  );
  await expect(readFile(queue, "utf8")).resolves.not.toContain(
    "private candidate",
  );
  expect(failure.recoveryPath.startsWith(root)).toBe(false);
  await expect(readFile(failure.recoveryPath)).resolves.toEqual(original);
  await rm(dirname(failure.recoveryPath), { force: true, recursive: true });
});

it("rejects a recovery base inside the project before writing private bytes", async () => {
  const root = await createRoot();
  const recoveryBase = join(root, "attacker-controlled-temp");
  const queue = join(root, "data", "review", "sync-candidates.json");
  const original = '[{"rawText":"private candidate"}]\n';
  await mkdir(recoveryBase);
  await writeFile(queue, original);
  let buildStarted = false;

  await expect(
    runPublicIsolationGate({
      root,
      recoveryBase,
      runBuild: async () => {
        buildStarted = true;
      },
    }),
  ).rejects.toThrow("recovery directory must be outside the project root");

  expect(buildStarted).toBe(false);
  await expect(readFile(queue, "utf8")).resolves.toBe(original);
  await expect(readdir(recoveryBase)).resolves.toEqual([]);
});

it("rejects a recovery base whose real path is inside the project", async () => {
  const recoveryBase = await mkdtemp(
    join(tmpdir(), "bumingbai-recovery-real-boundary-"),
  );

  await expect(
    createQueueRecovery({
      bytes: Buffer.from('[{"rawText":"private candidate"}]\n'),
      projectRootPath: join(recoveryBase, "lexically-unrelated-child"),
      projectRootRealPath: await realpath(recoveryBase),
      recoveryBase,
      revalidate: async () => undefined,
    }),
  ).rejects.toThrow("recovery directory must be outside the project root");
  await expect(readdir(recoveryBase)).resolves.toEqual([]);
});

it("reports cleanup failure separately after canonical restoration", async () => {
  let restored = false;
  const recovery = {
    directory: "C:\\temp\\recovery",
    path: "C:\\temp\\recovery\\sync-candidates.json",
  };

  await expect(
    restoreQueueAndRemoveRecovery(
      recovery,
      async () => {
        restored = true;
      },
      async () => {
        throw new Error("remove failed");
      },
    ),
  ).rejects.toMatchObject({
    name: "PublicIsolationRecoveryCleanupError",
    recoveryPath: recovery.path,
  } satisfies Partial<PublicIsolationRecoveryCleanupError>);
  expect(restored).toBe(true);
});

it("retains recovery and skips cleanup when canonical restoration fails", async () => {
  let cleanupStarted = false;
  const recovery = {
    directory: "C:\\temp\\recovery",
    path: "C:\\temp\\recovery\\sync-candidates.json",
  };

  await expect(
    restoreQueueAndRemoveRecovery(
      recovery,
      async () => {
        throw new Error("restore failed");
      },
      async () => {
        cleanupStarted = true;
      },
    ),
  ).rejects.toMatchObject({
    name: "PublicIsolationRecoveryRequiredError",
    recoveryPath: recovery.path,
  } satisfies Partial<PublicIsolationRecoveryRequiredError>);
  expect(cleanupStarted).toBe(false);
});
