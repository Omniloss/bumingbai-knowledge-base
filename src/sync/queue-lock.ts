import { createHash } from "node:crypto";
import { createServer, type Server } from "node:net";
import { resolve } from "node:path";

const defaultTimeoutMilliseconds = 150_000;
const releaseTimeoutMilliseconds = 1_000;
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

function closeAllConnections(server: Server): void {
  if (
    "closeAllConnections" in server &&
    typeof server.closeAllConnections === "function"
  ) {
    server.closeAllConnections();
  }
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

type ListenResult = "acquired" | "occupied" | "timed-out";

async function listen(
  server: Server,
  port: number,
  timeoutMilliseconds: number,
): Promise<ListenResult> {
  return new Promise((resolveListen, rejectListen) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      server.unref();
      if (server.listening) {
        closeAllConnections(server);
        server.close(() => undefined);
      }
      resolveListen("timed-out");
    }, timeoutMilliseconds);
    const onError = (error: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (errorCode(error) === "EADDRINUSE") {
        resolveListen("occupied");
        return;
      }
      rejectListen(error);
    };
    server.once("error", onError);
    server.listen({ exclusive: true, host: "127.0.0.1", port }, () => {
      if (settled) {
        server.off("error", onError);
        void close(server).catch(() => undefined);
        return;
      }
      settled = true;
      clearTimeout(timer);
      server.off("error", onError);
      resolveListen("acquired");
    });
  });
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error === undefined) resolveClose();
      else rejectClose(error);
    };
    const timer = setTimeout(() => {
      closeAllConnections(server);
      server.unref();
      finish(
        new Error("Recommendation candidate queue lock release timed out"),
      );
    }, releaseTimeoutMilliseconds);
    server.close((error) => {
      finish(error);
    });
    closeAllConnections(server);
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
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error("Recommendation candidate queue lock timed out");
    }
    const candidate = createServer((socket) => socket.destroy());
    const result = await listen(candidate, port, remaining);
    if (result === "timed-out") {
      throw new Error("Recommendation candidate queue lock timed out");
    }
    if (result === "acquired") {
      if (Date.now() >= deadline) {
        await close(candidate);
        throw new Error("Recommendation candidate queue lock timed out");
      }
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
