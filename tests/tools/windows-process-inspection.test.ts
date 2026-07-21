import { expect, it } from "vitest";
import { matchTrackedWindowsProcessIdentitiesForTest } from "../../tools/windows-process-inspection.js";

const tracked = [
  {
    name: "node.exe",
    observedAt: Date.parse("2026-07-20T00:00:01.000Z"),
    parentProcessId: 10,
    processId: 11,
    retired: false,
  },
];

it("matches the original process identity observed before tracking", () => {
  expect(
    matchTrackedWindowsProcessIdentitiesForTest(tracked, [
      { createdAt: "2026-07-20T00:00:00.000Z", processId: 11 },
    ]),
  ).toEqual([
    {
      createdAt: "2026-07-20T00:00:00.000Z",
      parentProcessId: 10,
      processId: 11,
    },
  ]);
});

it("fails closed when a tracked PID has a newer creation identity", () => {
  expect(() =>
    matchTrackedWindowsProcessIdentitiesForTest(tracked, [
      { createdAt: "2026-07-20T00:00:02.000Z", processId: 11 },
    ]),
  ).toThrow("Tracked Windows process identity changed");
});
