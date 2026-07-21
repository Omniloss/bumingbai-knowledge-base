import { expect, it, vi } from "vitest";
import { renameQueue } from "../../src/sync/queue-rename.js";

function eperm(): Error {
  return Object.assign(new Error("rename EPERM"), { code: "EPERM" });
}

it("retries one EPERM only when the injected platform is win32", async () => {
  const rename = vi
    .fn()
    .mockRejectedValueOnce(eperm())
    .mockResolvedValueOnce(undefined);
  const revalidate = vi.fn().mockResolvedValue(undefined);

  await expect(
    renameQueue("temporary", "destination", revalidate, {
      platform: "win32",
      rename,
      wait: async () => undefined,
    }),
  ).resolves.toBeUndefined();
  expect(rename).toHaveBeenCalledTimes(2);
  expect(revalidate).toHaveBeenCalledTimes(2);
});

it("rejects a persistent win32 EPERM after three attempts", async () => {
  const error = eperm();
  const rename = vi.fn().mockRejectedValue(error);

  await expect(
    renameQueue("temporary", "destination", async () => undefined, {
      platform: "win32",
      rename,
      wait: async () => undefined,
    }),
  ).rejects.toBe(error);
  expect(rename).toHaveBeenCalledTimes(3);
});

it("rethrows a non-win32 EPERM without retrying", async () => {
  const error = eperm();
  const rename = vi.fn().mockRejectedValue(error);

  await expect(
    renameQueue("temporary", "destination", async () => undefined, {
      platform: "linux",
      rename,
      wait: async () => undefined,
    }),
  ).rejects.toBe(error);
  expect(rename).toHaveBeenCalledTimes(1);
});
