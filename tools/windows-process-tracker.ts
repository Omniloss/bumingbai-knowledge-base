export type WindowsProcessSnapshot = {
  name: string;
  parentProcessId: number;
  processId: number;
};
export type TrackedWindowsProcessSnapshot = WindowsProcessSnapshot & {
  observedAt: number;
  retired: boolean;
};

export type WindowsProcessProvider = () => Promise<WindowsProcessSnapshot[]>;

export type WindowsProcessTracker = {
  records: () => TrackedWindowsProcessSnapshot[];
  snapshot: () => Promise<TrackedWindowsProcessSnapshot[]>;
  stop: () => Promise<TrackedWindowsProcessSnapshot[]>;
};

const POLL_INTERVAL_MILLISECONDS = 10;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

export function mergeTrackedProcessSnapshot(
  rootProcessId: number,
  tracked: ReadonlyMap<number, TrackedWindowsProcessSnapshot>,
  snapshot: readonly WindowsProcessSnapshot[],
  observedAt = Date.now(),
): Map<number, TrackedWindowsProcessSnapshot> {
  const merged = new Map(tracked);
  const currentByPid = new Map(
    snapshot.map((process) => [process.processId, process]),
  );
  for (const [processId, process] of merged) {
    const current = currentByPid.get(processId);
    if (current === undefined || current.name !== process.name) {
      merged.set(processId, { ...process, retired: true });
    }
  }
  const children = new Map<number, WindowsProcessSnapshot[]>();
  for (const process of snapshot) {
    const siblings = children.get(process.parentProcessId) ?? [];
    siblings.push(process);
    children.set(process.parentProcessId, siblings);
    if (process.processId === rootProcessId && !merged.has(process.processId)) {
      merged.set(process.processId, { ...process, observedAt, retired: false });
    }
  }

  const pending = [...merged.values()]
    .filter((process) => !process.retired)
    .map((process) => process.processId);
  const visited = new Set<number>();
  while (pending.length > 0) {
    const parentProcessId = pending.pop();
    if (parentProcessId === undefined || visited.has(parentProcessId)) continue;
    visited.add(parentProcessId);
    for (const child of children.get(parentProcessId) ?? []) {
      let trackedChild = merged.get(child.processId);
      if (trackedChild === undefined) {
        trackedChild = {
          ...child,
          observedAt,
          retired: false,
        };
        merged.set(child.processId, trackedChild);
      }
      if (!trackedChild.retired) pending.push(child.processId);
    }
  }
  return merged;
}

export async function loadWindowsProcessProvider(): Promise<WindowsProcessProvider> {
  assertSupportedWindowsArchitectureForTest();
  const processTree = await import("@vscode/windows-process-tree");
  return () =>
    new Promise((resolveProcesses, rejectProcesses) => {
      try {
        processTree.getAllProcesses((processes) => {
          resolveProcesses(
            processes.map((process) => ({
              name: process.name,
              parentProcessId: process.ppid,
              processId: process.pid,
            })),
          );
        });
      } catch (error: unknown) {
        rejectProcesses(error);
      }
    });
}

export function assertSupportedWindowsArchitectureForTest(
  architecture = process.arch,
): void {
  if (architecture !== "x64") {
    throw new Error(
      `Windows build process tracking requires x64, received ${architecture}`,
    );
  }
}

export function startWindowsProcessTracker(
  rootProcessId: number,
  provider: WindowsProcessProvider,
  pollIntervalMilliseconds = POLL_INTERVAL_MILLISECONDS,
): WindowsProcessTracker {
  let stopping = false;
  let tracked = new Map<number, TrackedWindowsProcessSnapshot>();
  let failure: unknown;
  let samples = Promise.resolve();

  const sample = (): Promise<void> => {
    samples = samples.then(async () => {
      tracked = mergeTrackedProcessSnapshot(
        rootProcessId,
        tracked,
        await provider(),
      );
    });
    return samples;
  };

  const polling = (async () => {
    while (!stopping) {
      try {
        await sample();
      } catch (error: unknown) {
        failure = error;
        stopping = true;
        break;
      }
      await wait(pollIntervalMilliseconds);
    }
  })();

  return {
    records: () => [...tracked.values()],
    snapshot: async () => {
      await sample();
      return [...tracked.values()];
    },
    stop: async () => {
      stopping = true;
      await polling;
      if (failure !== undefined) throw failure;
      await sample();
      return [...tracked.values()];
    },
  };
}
