import { spawn } from "node:child_process";

type ProcessExit = { code: number | null };
type ProcessRecord = {
  createdAt: string;
  parentProcessId: number;
  processId: number;
};
type Signal = (pid: number, signal: NodeJS.Signals) => void;

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

async function taskkill(pid: number): Promise<number | null> {
  const child = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  const exit = exited(child);
  if (!(await exitsWithin(exit, 5_000))) {
    child.kill();
    throw new Error("taskkill did not terminate");
  }
  return (await exit).code;
}

export async function requireTaskkillSuccessForTest(
  taskkillResult: Promise<number | null>,
): Promise<void> {
  if ((await taskkillResult) !== 0) {
    throw new Error("taskkill failed");
  }
}

async function capture(command: string, args: string[]): Promise<string> {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
  let output = "";
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    output += chunk;
  });
  const exit = exited(child);
  if (!(await exitsWithin(exit, 5_000))) {
    child.kill();
    throw new Error(`${command} did not terminate`);
  }
  return output;
}

function processRecords(value: unknown): ProcessRecord[] {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const processId = "ProcessId" in item ? Number(item.ProcessId) : Number.NaN;
    const parentProcessId =
      "ParentProcessId" in item ? Number(item.ParentProcessId) : Number.NaN;
    const createdAt = "CreationDate" in item ? String(item.CreationDate) : "";
    return Number.isInteger(processId) &&
      Number.isInteger(parentProcessId) &&
      createdAt !== ""
      ? [{ processId, parentProcessId, createdAt }]
      : [];
  });
}

async function windowsProcesses(): Promise<ProcessRecord[]> {
  const output = await capture("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate | ConvertTo-Json -Compress",
  ]);
  const records = processRecords(JSON.parse(output));
  if (records.length === 0)
    throw new Error("Unable to inspect Windows process tree");
  return records;
}

function descendants(records: ProcessRecord[], pid: number): ProcessRecord[] {
  const pending = [pid];
  const found: ProcessRecord[] = [];
  while (pending.length > 0) {
    const parent = pending.pop();
    for (const record of records) {
      if (record.parentProcessId === parent) {
        found.push(record);
        pending.push(record.processId);
      }
    }
  }
  return found.reverse();
}

function stillRunning(
  records: ProcessRecord[],
  known: ProcessRecord[],
): ProcessRecord[] {
  return known.filter((target) =>
    records.some(
      (current) =>
        current.processId === target.processId &&
        current.createdAt === target.createdAt,
    ),
  );
}

export async function terminatePosixGroupForTest(
  pid: number,
  rootExit: Promise<ProcessExit>,
  signal: Signal,
  pause: (milliseconds: number) => Promise<void>,
): Promise<void> {
  signal(-pid, "SIGTERM");
  await pause(500);
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
  if (!(await exitsWithin(rootExit, 5_000)))
    throw new Error("Build process did not terminate");
}

async function terminate(
  child: ReturnType<typeof spawn>,
  exit: Promise<ProcessExit>,
  platform: NodeJS.Platform,
): Promise<void> {
  if (child.pid === undefined) throw new Error("Build process has no PID");
  if (platform === "win32") {
    const before = await windowsProcesses();
    const root = before.find((record) => record.processId === child.pid);
    if (root === undefined) return;
    const known = [root, ...descendants(before, child.pid)];
    for (const target of [...known].reverse()) {
      const result = await taskkill(target.processId);
      if (result !== 0) {
        const current = await windowsProcesses();
        if (stillRunning(current, [target]).length > 0) {
          await requireTaskkillSuccessForTest(Promise.resolve(result));
        }
      }
    }
    if (!(await exitsWithin(exit, 5_000)))
      throw new Error("Build process did not terminate");
    const after = await windowsProcesses();
    if (stillRunning(after, known).length > 0)
      throw new Error("Build process tree did not terminate");
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
  const child = spawn(
    windows ? "cmd.exe" : "pnpm",
    windows ? ["/d", "/s", "/c", "pnpm.cmd run build"] : ["run", "build"],
    { cwd: root, stdio: "inherit", shell: false, detached: !windows },
  );
  const exit = exited(child);
  let timeout: NodeJS.Timeout | undefined;
  const timeoutSignal = new Promise<"timeout">((resolveTimeout) => {
    timeout = setTimeout(() => resolveTimeout("timeout"), timeoutMilliseconds);
  });
  try {
    const result = await Promise.race([exit, timeoutSignal]);
    if (result === "timeout") {
      await terminate(child, exit, platform);
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
