import { spawn } from "node:child_process";
import {
  liveWindowsProcessRecords,
  type ProcessRecord,
} from "./windows-process-inspection.js";
import type {
  TrackedWindowsProcessSnapshot,
  WindowsProcessTracker,
} from "./windows-process-tracker.js";

export type { ProcessRecord } from "./windows-process-inspection.js";

type ProcessExit = { code: number | null };
type Clock = {
  deadlineMilliseconds?: number;
  inspect?: (
    target: ProcessRecord,
    timeoutMilliseconds: number,
  ) => Promise<ProcessRecord | undefined>;
  now?: () => number;
};
type WindowsQuery = (timeoutMilliseconds: number) => Promise<ProcessRecord[]>;
type WindowsKill = (
  pid: number,
  timeoutMilliseconds: number,
) => Promise<number | null>;

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

async function exitsWithin(
  exit: Promise<ProcessExit>,
  milliseconds: number,
): Promise<boolean> {
  return Promise.race([
    exit.then(() => true),
    wait(milliseconds).then(() => false),
  ]);
}

function remaining(deadline: number, now: () => number): number {
  const milliseconds = deadline - now();
  if (milliseconds <= 0)
    throw new Error("Windows process termination exceeded deadline");
  return milliseconds;
}

function sameProcess(left: ProcessRecord, right: ProcessRecord): boolean {
  return (
    left.processId === right.processId && left.createdAt === right.createdAt
  );
}

function targetsForRoot(
  records: readonly ProcessRecord[],
  root: ProcessRecord,
): ProcessRecord[] {
  const pending = [{ processId: root.processId, depth: 0 }];
  const found: Array<ProcessRecord & { depth: number }> = [];
  const visited = new Set<number>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || visited.has(current.processId)) continue;
    visited.add(current.processId);
    for (const record of records) {
      if (record.parentProcessId !== current.processId) continue;
      found.push({ ...record, depth: current.depth + 1 });
      pending.push({ processId: record.processId, depth: current.depth + 1 });
    }
  }
  const liveRoot = records.find((record) => sameProcess(record, root));
  if (liveRoot !== undefined) found.push({ ...liveRoot, depth: 0 });
  return found.sort((left, right) => right.depth - left.depth);
}

function hasProcess(
  records: readonly ProcessRecord[],
  target: ProcessRecord,
): boolean {
  return records.some((record) => sameProcess(record, target));
}

export async function requireTaskkillSuccessForTest(
  result: Promise<number | null>,
): Promise<void> {
  if ((await result) !== 0) throw new Error("taskkill failed");
}

export async function terminateWindowsForTest(
  root: ProcessRecord,
  initial: ProcessRecord[],
  query: WindowsQuery,
  kill: WindowsKill,
  options: Clock = {},
): Promise<void> {
  const now = options.now ?? Date.now;
  const deadline = now() + (options.deadlineMilliseconds ?? SHUTDOWN_TIMEOUT);
  const graph = [...initial];
  const known = new Map(
    targetsForRoot(graph, root).map((target) => [target.processId, target]),
  );
  while (true) {
    const current = await query(remaining(deadline, now));
    graph.push(
      ...current.filter(
        (record) =>
          !graph.some((knownRecord) => sameProcess(knownRecord, record)),
      ),
    );
    for (const target of targetsForRoot(graph, root)) {
      if (!known.has(target.processId)) known.set(target.processId, target);
    }
    const live = [...known.values()].filter((target) =>
      hasProcess(current, target),
    );
    if (live.length === 0) return;
    for (const target of live) {
      const inspected =
        options.inspect === undefined
          ? current.find((record) => sameProcess(record, target))
          : await options.inspect(target, remaining(deadline, now));
      if (inspected === undefined || !sameProcess(inspected, target)) continue;
      const result = await kill(target.processId, remaining(deadline, now));
      if (result !== 0) {
        const after =
          options.inspect === undefined
            ? (await query(remaining(deadline, now))).find((record) =>
                sameProcess(record, target),
              )
            : await options.inspect(target, remaining(deadline, now));
        if (after !== undefined)
          await requireTaskkillSuccessForTest(Promise.resolve(result));
      }
    }
  }
}

async function taskkill(
  pid: number,
  timeoutMilliseconds: number,
): Promise<number | null> {
  const child = spawn("taskkill", ["/pid", String(pid), "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  const exit = exited(child);
  if (!(await exitsWithin(exit, timeoutMilliseconds))) {
    child.kill();
    throw new Error("taskkill did not terminate");
  }
  return (await exit).code;
}

function graphRecords(
  rootProcessId: number,
  tracked: readonly TrackedWindowsProcessSnapshot[],
  live: readonly ProcessRecord[],
): { graph: ProcessRecord[]; root: ProcessRecord } {
  const liveByPid = new Map(
    live.map((process) => [process.processId, process]),
  );
  const graph = tracked.map(
    (process) =>
      liveByPid.get(process.processId) ?? {
        createdAt: `exited:${process.processId}`,
        parentProcessId: process.parentProcessId,
        processId: process.processId,
      },
  );
  const root = graph.find((process) => process.processId === rootProcessId) ?? {
    createdAt: `exited:${rootProcessId}`,
    parentProcessId: 0,
    processId: rootProcessId,
  };
  return { graph, root };
}

export async function terminateTrackedWindows(
  rootProcessId: number,
  rootExit: Promise<ProcessExit>,
  tracker: WindowsProcessTracker,
): Promise<void> {
  const deadline = Date.now() + SHUTDOWN_TIMEOUT;
  try {
    const initialTracked = await tracker.snapshot();
    const initialLive = await liveWindowsProcessRecords(
      initialTracked,
      remaining(deadline, Date.now),
    );
    const { graph, root } = graphRecords(
      rootProcessId,
      initialTracked,
      initialLive,
    );
    const query: WindowsQuery = async (timeout) =>
      liveWindowsProcessRecords(await tracker.snapshot(), timeout);
    await terminateWindowsForTest(root, graph, query, taskkill, {
      deadlineMilliseconds: remaining(deadline, Date.now),
      inspect: async (target, timeout) => {
        const tracked = tracker
          .records()
          .filter((process) => process.processId === target.processId);
        return (await liveWindowsProcessRecords(tracked, timeout)).find(
          (process) => sameProcess(process, target),
        );
      },
    });
    if (!(await exitsWithin(rootExit, remaining(deadline, Date.now)))) {
      throw new Error("Build process did not terminate");
    }
  } finally {
    await tracker.stop();
  }
}
