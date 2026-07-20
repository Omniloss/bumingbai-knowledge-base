import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";

const timeoutMilliseconds = 150_000;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

function code(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

type Owner = {
  host: string;
  nonce: string;
  pid: number;
  processStartedAt: number;
};

type LockIdentity = { dev: number; ino: number; nonce: string };

function owner(nonce: string): Owner {
  return {
    nonce,
    pid: process.pid,
    host: hostname(),
    processStartedAt: Math.floor(Date.now() - process.uptime() * 1_000),
  };
}

async function lockIdentity(lock: string): Promise<LockIdentity> {
  const stats = await lstat(lock);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("Recommendation candidate queue lock is not a directory");
  }
  const current: unknown = JSON.parse(
    await readFile(`${lock}/owner.json`, "utf8"),
  );
  if (
    typeof current !== "object" ||
    current === null ||
    !("nonce" in current) ||
    typeof current.nonce !== "string"
  ) {
    throw new Error("Recommendation candidate queue lock owner is invalid");
  }
  return { dev: stats.dev, ino: stats.ino, nonce: current.nonce };
}

async function removeOwnedLock(
  lock: string,
  expected: LockIdentity,
): Promise<void> {
  const current = await lockIdentity(lock);
  if (
    current.dev !== expected.dev ||
    current.ino !== expected.ino ||
    current.nonce !== expected.nonce
  ) {
    throw new Error("Recommendation candidate queue lock identity changed");
  }
  const moved = `${lock}.${expected.nonce}.remove`;
  await rename(lock, moved);
  const movedIdentity = await lockIdentity(moved);
  if (
    movedIdentity.dev !== expected.dev ||
    movedIdentity.ino !== expected.ino ||
    movedIdentity.nonce !== expected.nonce
  ) {
    throw new Error("Recommendation candidate queue lock identity changed");
  }
  await rm(moved, { recursive: true });
}

async function release(lock: string, identity: LockIdentity): Promise<void> {
  try {
    await removeOwnedLock(lock, identity);
  } catch (error: unknown) {
    if (
      code(error) !== "ENOENT" &&
      !(error instanceof Error && error.message.endsWith("identity changed"))
    )
      throw error;
  }
}

async function staleOwner(lock: string): Promise<boolean> {
  const value: unknown = JSON.parse(
    await readFile(`${lock}/owner.json`, "utf8"),
  );
  if (
    typeof value !== "object" ||
    value === null ||
    !("host" in value) ||
    !("pid" in value) ||
    typeof value.host !== "string" ||
    !Number.isInteger(value.pid)
  ) {
    throw new Error("Recommendation candidate queue lock owner is invalid");
  }
  if (value.host !== hostname()) {
    throw new Error("Recommendation candidate queue lock owner is unknown");
  }
  try {
    process.kill(Number(value.pid), 0);
    return false;
  } catch (error: unknown) {
    if (code(error) === "ESRCH") return true;
    throw new Error("Recommendation candidate queue lock owner is unknown");
  }
}

export async function withQueueLock<T>(
  destination: string,
  operation: () => Promise<T>,
  timeout = timeoutMilliseconds,
): Promise<T> {
  const lock = `${destination}.lock`;
  const nonce = randomUUID();
  const deadline = Date.now() + timeout;
  let acquired: LockIdentity | undefined;
  while (true) {
    try {
      await mkdir(lock);
      await writeFile(
        `${lock}/owner.json`,
        `${JSON.stringify(owner(nonce))}\n`,
        {
          encoding: "utf8",
          flag: "wx",
        },
      );
      acquired = await lockIdentity(lock);
      break;
    } catch (error: unknown) {
      if (code(error) === "ENOENT") continue;
      if (code(error) !== "EEXIST") throw error;
      const stats = await lstat(lock).catch((failure: unknown) => {
        if (code(failure) === "ENOENT") return undefined;
        throw failure;
      });
      if (stats === undefined) continue;
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new Error(
          "Recommendation candidate queue lock is not a directory",
        );
      }
      const stale = await staleOwner(lock).catch((failure: unknown) => {
        if (code(failure) === "ENOENT") return undefined;
        throw failure;
      });
      if (stale === undefined) {
        if (Date.now() >= deadline) {
          throw new Error("Recommendation candidate queue lock timed out");
        }
        await wait(20);
        continue;
      }
      if (stale) {
        const staleIdentity = await lockIdentity(lock);
        await removeOwnedLock(lock, staleIdentity).catch((failure: unknown) => {
          if (
            code(failure) !== "ENOENT" &&
            !(
              failure instanceof Error &&
              failure.message.endsWith("identity changed")
            )
          )
            throw failure;
        });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error("Recommendation candidate queue lock timed out");
      }
      await wait(20);
    }
  }
  try {
    return await operation();
  } finally {
    if (acquired !== undefined) await release(lock, acquired);
  }
}
