import { spawn } from "node:child_process";
import {
  loadWindowsProcessProvider,
  startWindowsProcessTracker,
  type WindowsProcessTracker,
} from "./windows-process-tracker.js";

export {
  type ProcessRecord,
  requireTaskkillSuccessForTest,
  terminateWindowsForTest,
} from "./windows-process-control.js";

import { terminateTrackedWindows } from "./windows-process-control.js";

export type ProcessExit = { code: number | null };
type Signal = (pid: number, signal: NodeJS.Signals | 0) => void;
type Clock = {
  deadlineMilliseconds?: number;
  graceMilliseconds?: number;
  now?: () => number;
};

const SHUTDOWN_TIMEOUT = 15_000;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

function exited(child: ReturnType<typeof spawn>): Promise<ProcessExit> {
  return new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code) => resolveExit({ code }));
  });
}

function remaining(deadline: number, now: () => number): number {
  const milliseconds = deadline - now();
  if (milliseconds <= 0) throw new Error("Build process did not terminate");
  return milliseconds;
}

function groupAlive(pid: number, signal: Signal): boolean {
  try {
    signal(-pid, 0);
    return true;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "ESRCH") return false;
      if (error.code === "EPERM") return true;
    }
    throw error;
  }
}

export async function terminatePosixGroupForTest(
  pid: number,
  rootExit: Promise<ProcessExit>,
  signal: Signal,
  pause: (milliseconds: number) => Promise<void>,
  options: Clock = {},
): Promise<void> {
  const now = options.now ?? Date.now;
  const deadline = now() + (options.deadlineMilliseconds ?? SHUTDOWN_TIMEOUT);
  const grace = options.graceMilliseconds ?? 500;
  let rootExited = false;
  void rootExit.then(() => {
    rootExited = true;
  });
  try {
    signal(-pid, "SIGTERM");
  } catch (error: unknown) {
    if (
      !(
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ESRCH"
      )
    )
      throw error;
    while (!rootExited) {
      await pause(Math.min(50, remaining(deadline, now)));
    }
    return;
  }
  await pause(Math.min(grace, remaining(deadline, now)));
  try {
    signal(-pid, "SIGKILL");
  } catch (error: unknown) {
    if (
      !(
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ESRCH"
      )
    )
      throw error;
  }
  while (true) {
    if (rootExited && !groupAlive(pid, signal)) return;
    await pause(Math.min(50, remaining(deadline, now)));
  }
}

async function cleanup(
  child: ReturnType<typeof spawn>,
  exit: Promise<ProcessExit>,
  platform: NodeJS.Platform,
  tracker?: WindowsProcessTracker,
): Promise<void> {
  if (child.pid === undefined) throw new Error("Build process has no PID");
  if (platform === "win32") {
    if (tracker === undefined)
      throw new Error("Windows process tracker is unavailable");
    await terminateTrackedWindows(child.pid, exit, tracker);
    return;
  }
  await terminatePosixGroupForTest(child.pid, exit, process.kill, wait);
}

export async function runBuild(
  root: string,
  timeoutMilliseconds: number,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const windows = platform === "win32";
  const provider = windows ? await loadWindowsProcessProvider() : undefined;
  const child = spawn(
    windows ? "cmd.exe" : "pnpm",
    windows ? ["/d", "/s", "/c", "pnpm.cmd run build"] : ["run", "build"],
    { cwd: root, stdio: "inherit", shell: false, detached: !windows },
  );
  const exit = exited(child);
  const tracker =
    windows && child.pid !== undefined && provider !== undefined
      ? startWindowsProcessTracker(child.pid, provider)
      : undefined;
  let timeout: NodeJS.Timeout | undefined;
  const timeoutSignal = new Promise<"timeout">((resolveTimeout) => {
    timeout = setTimeout(() => resolveTimeout("timeout"), timeoutMilliseconds);
  });
  try {
    const result = await Promise.race([exit, timeoutSignal]);
    await cleanup(child, exit, platform, tracker);
    if (result === "timeout") {
      throw new Error(
        `pnpm run build timed out after ${timeoutMilliseconds}ms`,
      );
    }
    if (result.code !== 0) {
      throw new Error(`pnpm run build exited with ${result.code ?? "no code"}`);
    }
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
