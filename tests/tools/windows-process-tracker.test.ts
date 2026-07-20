import { expect, it } from "vitest";
import {
  mergeTrackedProcessSnapshot,
  type WindowsProcessSnapshot,
} from "../../tools/windows-process-tracker.js";

const root: WindowsProcessSnapshot = {
  name: "cmd.exe",
  parentProcessId: 1,
  processId: 10,
};
const intermediate: WindowsProcessSnapshot = {
  name: "node.exe",
  parentProcessId: 10,
  processId: 11,
};
const orphan: WindowsProcessSnapshot = {
  name: "node.exe",
  parentProcessId: 11,
  processId: 12,
};

function observed(
  process: WindowsProcessSnapshot,
  observedAt: number,
): WindowsProcessSnapshot & { observedAt: number } {
  return { ...process, observedAt };
}

it("retains an orphan after its intermediate parent disappears", () => {
  const initial = mergeTrackedProcessSnapshot(
    root.processId,
    new Map(),
    [root, intermediate, orphan],
    100,
  );
  const afterParentsExit = mergeTrackedProcessSnapshot(
    root.processId,
    initial,
    [orphan],
    200,
  );

  expect([...afterParentsExit.values()]).toEqual([
    observed(root, 100),
    observed(intermediate, 100),
    observed(orphan, 100),
  ]);
});

it("does not absorb an unrelated process tree", () => {
  const unrelated: WindowsProcessSnapshot = {
    name: "unrelated.exe",
    parentProcessId: 99,
    processId: 100,
  };

  const tracked = mergeTrackedProcessSnapshot(
    root.processId,
    new Map(),
    [root, unrelated],
    100,
  );

  expect([...tracked.values()]).toEqual([observed(root, 100)]);
});

it("retains the first observation when a tracked PID is reused", () => {
  const initial = mergeTrackedProcessSnapshot(
    root.processId,
    new Map(),
    [root, intermediate, orphan],
    100,
  );
  const reused = mergeTrackedProcessSnapshot(
    root.processId,
    initial,
    [
      {
        name: "unrelated.exe",
        parentProcessId: 99,
        processId: orphan.processId,
      },
    ],
    200,
  );

  expect(reused.get(orphan.processId)).toEqual(observed(orphan, 100));
});
