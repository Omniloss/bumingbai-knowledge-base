import { expect, it } from "vitest";
import {
  assertSupportedWindowsArchitectureForTest,
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
  retired = false,
): WindowsProcessSnapshot & { observedAt: number; retired: boolean } {
  return { ...process, observedAt, retired };
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
    observed(root, 100, true),
    observed(intermediate, 100, true),
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

  expect(reused.get(orphan.processId)).toEqual(observed(orphan, 100, true));
});

it("does not absorb children after a tracked parent PID is retired", () => {
  const initial = mergeTrackedProcessSnapshot(
    root.processId,
    new Map(),
    [root, intermediate],
    100,
  );
  const afterParentExit = mergeTrackedProcessSnapshot(
    root.processId,
    initial,
    [root],
    200,
  );
  const afterPidReuse = mergeTrackedProcessSnapshot(
    root.processId,
    afterParentExit,
    [
      root,
      { ...intermediate, name: "node.exe" },
      { name: "unrelated-child.exe", parentProcessId: 11, processId: 13 },
    ],
    300,
  );

  expect(afterPidReuse.get(intermediate.processId)).toEqual(
    observed(intermediate, 100, true),
  );
  expect(afterPidReuse.has(13)).toBe(false);
});

it("fails explicitly on a Windows architecture without a bundled binary", () => {
  expect(() => assertSupportedWindowsArchitectureForTest("arm64")).toThrow(
    "Windows build process tracking requires x64, received arm64",
  );
  expect(() => assertSupportedWindowsArchitectureForTest("x64")).not.toThrow();
});
