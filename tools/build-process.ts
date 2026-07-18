import { spawn } from "node:child_process";

type ProcessExit = { code: number | null };
type ProcessRecord = { parentProcessId: number; processId: number };

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
  return (await exited(child)).code;
}

async function capture(command: string, args: string[]): Promise<string> {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
  let output = "";
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    output += chunk;
  });
  const exit = exited(child);
  if (!(await exitsWithin(exit, 10_000))) {
    child.kill();
    throw new Error(`${command} did not terminate`);
  }
  return output;
}

function processRecords(value: unknown): ProcessRecord[] {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    const processId = Number(record["ProcessId"]);
    const parentProcessId = Number(record["ParentProcessId"]);
    return Number.isInteger(processId) && Number.isInteger(parentProcessId)
      ? [{ processId, parentProcessId }]
      : [];
  });
}

async function windowsDescendants(pid: number): Promise<number[]> {
  try {
    const output = await capture("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress",
    ]);
    const pending = [pid];
    const descendants: number[] = [];
    const records = processRecords(JSON.parse(output));
    while (pending.length > 0) {
      const parent = pending.pop();
      for (const record of records) {
        if (record.parentProcessId === parent) {
          descendants.push(record.processId);
          pending.push(record.processId);
        }
      }
    }
    return descendants.reverse();
  } catch {
    return [];
  }
}

async function terminate(
  child: ReturnType<typeof spawn>,
  exit: Promise<ProcessExit>,
  platform: NodeJS.Platform,
): Promise<void> {
  if (child.pid === undefined) throw new Error("Build process has no PID");
  if (platform === "win32") {
    const descendants = await windowsDescendants(child.pid);
    for (const descendant of descendants) await taskkill(descendant);
    await taskkill(child.pid);
    if (!(await exitsWithin(exit, 5_000)))
      throw new Error("Build process did not terminate");
    return;
  }
  process.kill(-child.pid, "SIGTERM");
  if (await exitsWithin(exit, 500)) return;
  process.kill(-child.pid, "SIGKILL");
  if (!(await exitsWithin(exit, 5_000)))
    throw new Error("Build process did not terminate");
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
