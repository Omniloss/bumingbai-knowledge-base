import { expect, it, vi } from "vitest";
import {
  requireTaskkillSuccessForTest,
  terminatePosixGroupForTest,
} from "../../tools/build-process.js";

it("kills a stubborn detached group after its root has exited from SIGTERM", async () => {
  const signal = vi.fn();

  await terminatePosixGroupForTest(
    42,
    Promise.resolve({ code: 0 }),
    signal,
    async () => undefined,
  );

  expect(signal).toHaveBeenNthCalledWith(1, -42, "SIGTERM");
  expect(signal).toHaveBeenNthCalledWith(2, -42, "SIGKILL");
});

it("fails closed when a bounded Windows taskkill reports nonzero", async () => {
  await expect(
    requireTaskkillSuccessForTest(Promise.resolve(1)),
  ).rejects.toThrow("taskkill failed");
});
