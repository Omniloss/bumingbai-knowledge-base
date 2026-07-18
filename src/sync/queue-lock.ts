import { lstat, mkdir, rm } from "node:fs/promises";

const timeoutMilliseconds = 5_000;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

function missing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export async function withQueueLock<T>(
  destination: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lock = `${destination}.lock`;
  const deadline = Date.now() + timeoutMilliseconds;
  while (true) {
    try {
      await mkdir(lock);
      break;
    } catch (error: unknown) {
      if (
        !missing(error) &&
        !(
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "EEXIST"
        )
      ) {
        throw error;
      }
      const stats = await lstat(lock);
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new Error(
          "Recommendation candidate queue lock is not a directory",
        );
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
    await rm(lock, { recursive: true, force: true });
  }
}
