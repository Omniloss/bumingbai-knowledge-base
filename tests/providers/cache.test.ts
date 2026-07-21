import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
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

  it("returns undefined when the cache entry does not exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-provider-"));

    await expect(
      readProviderCache(root, "open_library", "work_123"),
    ).resolves.toBeUndefined();
  });

  it("returns undefined when cached JSON is malformed", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-provider-"));
    const directory = join(root, "open_library");
    await mkdir(directory);
    await writeFile(join(directory, "work_123.json"), "{not-json", "utf8");

    await expect(
      readProviderCache(root, "open_library", "work_123"),
    ).resolves.toBeUndefined();
  });

  it("returns undefined when cached records fail the supplied schema", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-provider-"));
    const directory = join(root, "open_library");
    await mkdir(directory);
    await writeFile(
      join(directory, "work_123.json"),
      JSON.stringify({
        provider: "open_library",
        retrievedAt: "2026-07-14T00:00:00.000Z",
        records: [{ externalId: 1 }],
      }),
      "utf8",
    );

    await expect(
      readProviderCache(
        root,
        "open_library",
        "work_123",
        z.object({ externalId: z.string() }),
      ),
    ).resolves.toBeUndefined();
  });

  it("returns undefined when the cached provider mismatches its directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-provider-"));
    const directory = join(root, "open_library");
    await mkdir(directory);
    await writeFile(
      join(directory, "work_123.json"),
      JSON.stringify({
        provider: "tmdb",
        retrievedAt: "2026-07-14T00:00:00.000Z",
        records: [],
      }),
      "utf8",
    );

    await expect(
      readProviderCache(root, "open_library", "work_123"),
    ).resolves.toBeUndefined();
  });

  it("rejects a result whose provider mismatches the cache directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-provider-"));

    await expect(
      writeProviderCache(root, "open_library", "work_123", {
        provider: "tmdb",
        retrievedAt: "2026-07-14T00:00:00.000Z",
        records: [],
      }),
    ).rejects.toThrow();
  });

  it.each([
    "",
    "..",
    "/",
    "\\",
    "nested/work",
    "nested\\work",
  ])("rejects unsafe cache key %j on reads and writes", async (key) => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-provider-"));
    const value = {
      provider: "open_library" as const,
      retrievedAt: "2026-07-14T00:00:00.000Z",
      records: [],
    };

    await expect(
      readProviderCache(root, "open_library", key),
    ).rejects.toThrow();
    await expect(
      writeProviderCache(root, "open_library", key, value),
    ).rejects.toThrow();
  });

  it("keeps concurrent same-key writes atomic and removes temporary files", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-provider-"));

    await Promise.all(
      ["OL1W", "OL2W"].map((externalId) =>
        writeProviderCache(root, "open_library", "work_123", {
          provider: "open_library",
          retrievedAt: "2026-07-14T00:00:00.000Z",
          records: [{ externalId }],
        }),
      ),
    );

    expect(await readdir(join(root, "open_library"))).toEqual([
      "work_123.json",
    ]);
    expect(
      await readProviderCache(root, "open_library", "work_123"),
    ).toMatchObject({
      records: [{ externalId: expect.stringMatching(/^OL[12]W$/) }],
    });
  });

  it("preserves the previous cache when a replacement write cannot serialize", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-provider-"));
    const directory = join(root, "open_library");
    const previous = {
      provider: "open_library" as const,
      retrievedAt: "2026-07-14T00:00:00.000Z",
      records: [{ externalId: "OL1W" }],
    };

    await writeProviderCache(root, "open_library", "work_123", previous);

    await expect(
      writeProviderCache(root, "open_library", "work_123", {
        provider: "open_library",
        retrievedAt: "2026-07-15T00:00:00.000Z",
        records: [{ externalId: 1n }],
      }),
    ).rejects.toThrow("Do not know how to serialize a BigInt");

    await expect(
      readProviderCache(root, "open_library", "work_123"),
    ).resolves.toEqual(previous);
    expect(await readdir(directory)).toEqual(["work_123.json"]);
  });

  it("removes its temporary file when rename fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-provider-"));
    const directory = join(root, "open_library");
    await mkdir(directory);
    await mkdir(join(directory, "work_123.json"));

    await expect(
      writeProviderCache(root, "open_library", "work_123", {
        provider: "open_library",
        retrievedAt: "2026-07-14T00:00:00.000Z",
        records: [],
      }),
    ).rejects.toThrow();

    expect(await readdir(directory)).toEqual(["work_123.json"]);
  });
});
