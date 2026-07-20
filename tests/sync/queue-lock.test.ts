import { mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  queueLockPortForTest,
  withQueueLock,
} from "../../src/sync/queue-lock.js";

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error === undefined) resolveClose();
      else rejectClose(error);
    });
  });
}

it("serializes operations for one queue target", async () => {
  const root = await mkdtemp(join(tmpdir(), "bumingbai-lock-"));
  const queue = join(root, "sync-candidates.json");
  let releaseFirst: () => void = () => undefined;
  let markStarted: () => void = () => undefined;
  const started = new Promise<void>((resolveStarted) => {
    markStarted = resolveStarted;
  });
  const first = withQueueLock(queue, async () => {
    markStarted();
    await new Promise<void>((resolveRelease) => {
      releaseFirst = resolveRelease;
    });
    return "first";
  });
  await started;
  let secondEntered = false;
  const second = withQueueLock(queue, async () => {
    secondEntered = true;
    return "second";
  });

  await wait(60);
  expect(secondEntered).toBe(false);
  releaseFirst();
  await expect(first).resolves.toBe("first");
  await expect(second).resolves.toBe("second");
});

it("times out while another process lease occupies the target port", async () => {
  const root = await mkdtemp(join(tmpdir(), "bumingbai-lock-"));
  const queue = join(root, "sync-candidates.json");
  const blocker = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    blocker.once("error", rejectListen);
    blocker.listen(
      {
        exclusive: true,
        host: "127.0.0.1",
        port: queueLockPortForTest(queue),
      },
      resolveListen,
    );
  });
  try {
    await expect(
      withQueueLock(queue, async () => undefined, 25),
    ).rejects.toThrow("Recommendation candidate queue lock timed out");
  } finally {
    await close(blocker);
  }
});

it("releases the lease after the protected operation rejects", async () => {
  const root = await mkdtemp(join(tmpdir(), "bumingbai-lock-"));
  const queue = join(root, "sync-candidates.json");
  await expect(
    withQueueLock(queue, async () => {
      throw new Error("operation failed");
    }),
  ).rejects.toThrow("operation failed");

  await expect(withQueueLock(queue, async () => "recovered")).resolves.toBe(
    "recovered",
  );
});

it("normalizes Windows target casing to one lease", () => {
  expect(queueLockPortForTest("C:\\Queue\\SYNC.json", "win32")).toBe(
    queueLockPortForTest("c:\\queue\\sync.JSON", "win32"),
  );
});
