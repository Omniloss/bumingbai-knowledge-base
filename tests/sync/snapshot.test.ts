import { mkdtemp, readdir, readFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { contentHash, writeSnapshot } from "../../src/sync/snapshot.js";
import type { OfficialEpisodeSnapshot } from "../../src/sync/types.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    rename: vi.fn(async (source: string, destination: string) => {
      await original.access(source);
      return original.rename(source, destination);
    }),
  };
});

function episode(title = "测试节目"): OfficialEpisodeSnapshot {
  return {
    number: 223,
    title,
    publishedAt: "Fri, 10 Jul 2026 12:54:34 GMT",
    duration: "1:05:42",
    officialUrl: "https://bumingbai.net/2026/07/10/ep-223/",
    guestNames: ["查建英"],
    descriptionHtml: "<p>测试</p>",
    sourceKind: "official_wordpress",
    retrievedAt: "2026-07-18T00:00:00.000Z",
    contentHash: "source-content-hash",
  };
}

describe("snapshot", () => {
  it("hashes equal content identically and changed titles differently", () => {
    expect(contentHash(episode())).toBe(contentHash({ ...episode() }));
    expect(contentHash(episode())).not.toBe(contentHash(episode("新标题")));
  });

  it("orders object keys without consulting the runtime locale", () => {
    const localeCompare = vi
      .spyOn(String.prototype, "localeCompare")
      .mockReturnValue(0);

    try {
      expect(contentHash({ z: 1, a: 2 })).toBe(contentHash({ a: 2, z: 1 }));
    } finally {
      localeCompare.mockRestore();
    }
  });

  it("publishes the snapshot by renaming a temporary file", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-snapshot-"));
    const snapshot = [episode()];
    const filename = `2026-07-18T00-00-00.000Z-${contentHash(snapshot)}.json`;

    const path = await writeSnapshot(root, snapshot);

    expect(path).toBe(join(root, "data", "raw", "official", filename));
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(snapshot);
    expect(await readdir(join(root, "data", "raw", "official"))).toEqual([
      filename,
    ]);
    expect(vi.mocked(rename)).toHaveBeenCalledWith(
      join(root, "data", "raw", "official", `.${filename}.tmp`),
      path,
    );
  });
});
