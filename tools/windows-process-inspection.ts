import { spawn } from "node:child_process";
import type { TrackedWindowsProcessSnapshot } from "./windows-process-tracker.js";

export type ProcessRecord = {
  createdAt: string;
  parentProcessId: number;
  processId: number;
};

type ProcessExit = { code: number | null };

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

function exited(child: ReturnType<typeof spawn>): Promise<ProcessExit> {
  return new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code) => resolveExit({ code }));
  });
}

async function exitsWithin(
  exit: Promise<ProcessExit>,
  milliseconds: number,
): Promise<boolean> {
  return Promise.race([
    exit.then(() => true),
    wait(milliseconds).then(() => false),
  ]);
}

async function capture(
  command: string,
  args: string[],
  timeoutMilliseconds: number,
): Promise<string> {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  });
  let output = "";
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    output += chunk;
  });
  const exit = exited(child);
  if (!(await exitsWithin(exit, timeoutMilliseconds))) {
    child.kill();
    throw new Error(`${command} did not terminate`);
  }
  if ((await exit).code !== 0) throw new Error(`${command} failed`);
  return output;
}

function identityRows(
  value: unknown,
): Array<{ createdAt: string; processId: number }> {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const processId = "ProcessId" in item ? Number(item.ProcessId) : Number.NaN;
    const createdAt = "CreationDate" in item ? String(item.CreationDate) : "";
    return Number.isInteger(processId) && createdAt !== ""
      ? [{ createdAt, processId }]
      : [];
  });
}

export function matchTrackedWindowsProcessIdentitiesForTest(
  tracked: readonly TrackedWindowsProcessSnapshot[],
  identities: ReadonlyArray<{ createdAt: string; processId: number }>,
): ProcessRecord[] {
  const trackedByPid = new Map(
    tracked.map((process) => [process.processId, process]),
  );
  return identities.flatMap((identity) => {
    const observed = trackedByPid.get(identity.processId);
    const createdAt = Date.parse(identity.createdAt);
    if (!Number.isFinite(createdAt)) {
      throw new Error("Unable to inspect Windows process identity");
    }
    if (observed !== undefined && createdAt > observed.observedAt) {
      throw new Error("Tracked Windows process identity changed");
    }
    return observed === undefined
      ? []
      : [{ ...identity, parentProcessId: observed.parentProcessId }];
  });
}

export async function liveWindowsProcessRecords(
  tracked: readonly TrackedWindowsProcessSnapshot[],
  timeoutMilliseconds: number,
): Promise<ProcessRecord[]> {
  if (tracked.length === 0) return [];
  const trackedByPid = new Map(
    tracked.map((process) => [process.processId, process]),
  );
  const pids = [...trackedByPid.keys()].join(",");
  const output = await capture(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `@(Get-Process -Id ${pids} -ErrorAction SilentlyContinue) | ForEach-Object { [PSCustomObject]@{ ProcessId = $_.Id; CreationDate = $_.StartTime.ToUniversalTime().ToString('o') } } | ConvertTo-Json -Compress`,
    ],
    timeoutMilliseconds,
  );
  if (output.trim() === "") return [];
  return matchTrackedWindowsProcessIdentitiesForTest(
    [...trackedByPid.values()],
    identityRows(JSON.parse(output)),
  );
}

export async function verifyTrackedWindowsProcessParents(
  tracked: readonly TrackedWindowsProcessSnapshot[],
  timeoutMilliseconds = 5_000,
): Promise<readonly number[]> {
  const live = await liveWindowsProcessRecords(tracked, timeoutMilliseconds);
  return live.map((process) => process.processId);
}
