import { expect, it, vi } from "vitest";
import {
  type BuildCleanupUnconfirmedError,
  requireConfirmedCleanupForTest,
  requireTaskkillSuccessForTest,
  terminatePosixGroupForTest,
  terminateWindowsForTest,
} from "../../tools/build-process.js";

it("kills a stubborn detached group after its root has exited from SIGTERM", async () => {
  const signal = vi.fn((_pid: number, value: NodeJS.Signals | 0) => {
    if (value === 0) {
      const error = Object.assign(new Error("gone"), { code: "ESRCH" });
      throw error;
    }
  });

  await terminatePosixGroupForTest(
    42,
    Promise.resolve({ code: 0 }),
    signal,
    async () => undefined,
  );

  expect(signal).toHaveBeenNthCalledWith(1, -42, "SIGTERM");
  expect(signal).toHaveBeenNthCalledWith(2, -42, "SIGKILL");
});

it("does not treat a successful process-group probe as termination", async () => {
  let clock = 0;
  const signal = vi.fn();

  await expect(
    terminatePosixGroupForTest(
      42,
      Promise.resolve({ code: 0 }),
      signal,
      async (milliseconds) => {
        clock += milliseconds;
      },
      { deadlineMilliseconds: 30, graceMilliseconds: 10, now: () => clock },
    ),
  ).rejects.toThrow("Build process did not terminate");

  expect(signal).toHaveBeenCalledWith(-42, "SIGKILL");
  expect(signal).toHaveBeenCalledWith(-42, 0);
});

it("accepts an already-absent process group after its root has exited", async () => {
  const signal = vi.fn(() => {
    throw Object.assign(new Error("gone"), { code: "ESRCH" });
  });

  await terminatePosixGroupForTest(
    42,
    Promise.resolve({ code: 0 }),
    signal,
    async () => undefined,
  );

  expect(signal).toHaveBeenCalledExactlyOnceWith(-42, "SIGTERM");
});

it("fails closed when a bounded Windows taskkill reports nonzero", async () => {
  await expect(
    requireTaskkillSuccessForTest(Promise.resolve(1)),
  ).rejects.toThrow("taskkill failed");
});

it("kills a child retained under an absent Windows root PID", async () => {
  const killed: number[] = [];
  const child = { createdAt: "child", parentProcessId: 42, processId: 43 };
  let queryCount = 0;
  await terminateWindowsForTest(
    { createdAt: "root", parentProcessId: 1, processId: 42 },
    [child],
    async () => (queryCount++ === 0 ? [child] : []),
    async (pid) => {
      killed.push(pid);
      return 0;
    },
  );
  expect(killed).toEqual([43]);
});

it("does not kill a PID whose creation identity changed before taskkill", async () => {
  const killed: number[] = [];
  await terminateWindowsForTest(
    { createdAt: "root", parentProcessId: 1, processId: 42 },
    [{ createdAt: "old", parentProcessId: 42, processId: 43 }],
    async () => [{ createdAt: "new", parentProcessId: 42, processId: 43 }],
    async (pid) => {
      killed.push(pid);
      return 0;
    },
  );
  expect(killed).toEqual([]);
});

it("fails when taskkill reports nonzero and the exact identity remains", async () => {
  const target = { createdAt: "child", parentProcessId: 42, processId: 43 };
  await expect(
    terminateWindowsForTest(
      { createdAt: "root", parentProcessId: 1, processId: 42 },
      [target],
      async () => [target],
      async () => 1,
    ),
  ).rejects.toThrow("taskkill failed");
});

it("fails once the Windows lifecycle deadline is exhausted", async () => {
  let clock = 0;
  await expect(
    terminateWindowsForTest(
      { createdAt: "root", parentProcessId: 1, processId: 42 },
      [{ createdAt: "child", parentProcessId: 42, processId: 43 }],
      async () => {
        clock = 31;
        return [{ createdAt: "child", parentProcessId: 42, processId: 43 }];
      },
      async () => 0,
      { deadlineMilliseconds: 30, now: () => clock },
    ),
  ).rejects.toThrow("Windows process termination exceeded deadline");
});

it("classifies cleanup rejection as unconfirmed lifecycle state", async () => {
  const failure = new Error("inspection failed");
  await expect(
    requireConfirmedCleanupForTest(Promise.reject(failure)),
  ).rejects.toMatchObject({
    cause: failure,
    name: "BuildCleanupUnconfirmedError",
  } satisfies Partial<BuildCleanupUnconfirmedError>);
});
