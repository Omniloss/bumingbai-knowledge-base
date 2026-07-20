import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { withQueueLock } from "../../src/sync/queue-lock.js";

it("does not remove a replacement lock with a different owner nonce", async () => {
  const root = await mkdtemp(join(tmpdir(), "bumingbai-lock-"));
  const queue = join(root, "sync-candidates.json");
  const lock = `${queue}.lock`;

  await withQueueLock(queue, async () => {
    await expect(readFile(join(lock, "owner.json"), "utf8")).resolves.toContain(
      "nonce",
    );
    await rm(lock, { recursive: true });
    await mkdir(lock);
    await writeFile(join(lock, "owner.json"), '{"nonce":"replacement"}\n');
  });

  await expect(readFile(join(lock, "owner.json"), "utf8")).resolves.toContain(
    "replacement",
  );
});

it("reclaims a stale local lock owner whose PID is no longer alive", async () => {
  const root = await mkdtemp(join(tmpdir(), "bumingbai-lock-"));
  const queue = join(root, "sync-candidates.json");
  const lock = `${queue}.lock`;
  await mkdir(lock);
  await writeFile(
    join(lock, "owner.json"),
    `${JSON.stringify({ host: hostname(), nonce: "dead", pid: 999_999, processStartedAt: 0 })}\n`,
  );

  await expect(withQueueLock(queue, async () => "acquired", 100)).resolves.toBe(
    "acquired",
  );
});

it("fails closed while a local owner PID remains alive", async () => {
  const root = await mkdtemp(join(tmpdir(), "bumingbai-lock-"));
  const queue = join(root, "sync-candidates.json");
  const lock = `${queue}.lock`;
  await mkdir(lock);
  await writeFile(
    join(lock, "owner.json"),
    `${JSON.stringify({ host: hostname(), nonce: "live", pid: process.pid, processStartedAt: 0 })}\n`,
  );

  await expect(withQueueLock(queue, async () => undefined, 25)).rejects.toThrow(
    "Recommendation candidate queue lock timed out",
  );
});
