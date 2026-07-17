import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readProviderCache,
  writeProviderCache,
} from "../../src/providers/cache.js";

describe("provider cache", () => {
  it("round trips the last successful result", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-provider-"));
    await writeProviderCache(root, "open_library", "work_123", {
      provider: "open_library",
      retrievedAt: "2026-07-14T00:00:00.000Z",
      records: [{ externalId: "OL1W" }],
    });

    expect(await readProviderCache(root, "open_library", "work_123")).toEqual({
      provider: "open_library",
      retrievedAt: "2026-07-14T00:00:00.000Z",
      records: [{ externalId: "OL1W" }],
    });
    expect(
      JSON.parse(await readFile(`${root}/open_library/work_123.json`, "utf8")),
    ).toBeTruthy();
  });
});
