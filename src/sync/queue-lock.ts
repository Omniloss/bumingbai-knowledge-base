import { createHash } from "node:crypto";
import { createServer, type Server } from "node:net";
import { resolve } from "node:path";

const defaultTimeoutMilliseconds = 150_000;
const minimumPort = 20_000;
const portCount = 20_000;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function targetKey(destination: string, platform = process.platform): string {
  const absolute = resolve(destination);
  return platform === "win32" ? absolute.toLocaleLowerCase("en-US") : absolute;
}

export function queueLockPortForTest(
  destination: string,
  platform = process.platform,
): number {
  const digest = createHash("sha256")
    .update(targetKey(destination, platform))
    .digest();
  return minimumPort + (digest.readUInt16BE(0) % portCount);
}

async function listen(server: Server, port: number): Promise<boolean> {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (error: unknown): void => {
      if (errorCode(error) === "EADDRINUSE") {
        resolveListen(false);
        return;
      }
      rejectListen(error);
    };
    server.once("error", onError);
    server.listen({ exclusive: true, host: "127.0.0.1", port }, () => {
      server.off("error", onError);
      resolveListen(true);
    });
  });
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error === undefined) resolveClose();
      else rejectClose(error);
    });
  });
}

export async function withQueueLock<T>(
  destination: string,
  operation: () => Promise<T>,
  timeout = defaultTimeoutMilliseconds,
): Promise<T> {
  const port = queueLockPortForTest(destination);
  const deadline = Date.now() + timeout;
  let lease: Server | undefined;
  while (lease === undefined) {
    const candidate = createServer();
    if (await listen(candidate, port)) {
      lease = candidate;
      break;
    }
    if (Date.now() >= deadline) {
      throw new Error("Recommendation candidate queue lock timed out");
    }
    await wait(Math.min(20, Math.max(1, deadline - Date.now())));
  }
  try {
    return await operation();
  } finally {
    await close(lease);
  }
}
