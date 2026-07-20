import { execFile as executeFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  assessChangeScope,
  checkChangeScope,
} from "../../tools/check-change-scope.js";

const execFile = promisify(executeFile);

const episode = (overrides: Record<string, unknown> = {}) => ({
  id: "episode_123456789abc",
  slug: "ep-1",
  verificationStatus: "partially_verified",
  publicationStatus: "public",
  sources: [
    {
      kind: "official_episode",
      url: "https://bumingbai.net/episodes/ep-1/",
      retrievedAt: "2026-07-18T00:00:00.000Z",
    },
  ],
  number: 1,
  title: "第一期",
  publishedAt: "2026-07-18T00:00:00.000Z",
  officialUrl: "https://bumingbai.net/episodes/ep-1/",
  guestIds: [],
  topicIds: [],
  ...overrides,
});

const person = (overrides: Record<string, unknown> = {}) => ({
  id: "person_123456789abc",
  slug: "guest-1",
  verificationStatus: "partially_verified",
  publicationStatus: "public",
  sources: [
    {
      kind: "official_episode",
      url: "https://bumingbai.net/episodes/ep-1/",
      retrievedAt: "2026-07-18T00:00:00.000Z",
    },
  ],
  name: "guest",
  aliases: [],
  roles: ["guest"],
  ...overrides,
});
const rawSnapshot = [
  {
    number: 1,
    title: "First episode",
    publishedAt: "2026-07-18T00:00:00.000Z",
    officialUrl: "https://bumingbai.net/episodes/ep-1/",
    guestNames: [],
    descriptionHtml: "<p>episode body</p>",
    sourceKind: "official_wordpress",
    retrievedAt: "2026-07-20T00:00:00.000Z",
    contentHash: "a".repeat(64),
  },
];
function change(
  path: string,
  before?: unknown,
  after?: unknown,
  status: "A" | "M" | "D" = "M",
) {
  return { path, before, after, status };
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (
    await execFile("git", args, {
      cwd,
      windowsHide: true,
    })
  ).stdout.trim();
}

describe("assessChangeScope", () => {
  it("accepts raw snapshots and whitelisted episode edits", () => {
    const before = [episode()];
    const after = [episode({ duration: "1:02:03" })];

    expect(
      assessChangeScope([
        change(
          "data/raw/official/2026-07-18.json",
          undefined,
          rawSnapshot,
          "A",
        ),
        change("data/catalog/episodes.json", before, after),
      ]).lowRiskOnly,
    ).toBe(true);
  });

  it("rejects raw snapshot modification", () => {
    expect(
      assessChangeScope([
        change(
          "data/raw/official/2026-07-18.json",
          rawSnapshot,
          rawSnapshot,
          "M",
        ),
      ]).lowRiskOnly,
    ).toBe(false);
  });

  it("treats every review candidate queue change as high risk", () => {
    expect(
      assessChangeScope([
        change("data/review/sync-candidates.json", [], [{ rawText: "《A》" }]),
      ]).lowRiskOnly,
    ).toBe(false);
  });

  it("rejects files outside the narrow allowlist", () => {
    expect(
      assessChangeScope([change("data/catalog/works.json", [], [])])
        .lowRiskOnly,
    ).toBe(false);
  });

  it("rejects episode deletion", () => {
    expect(
      assessChangeScope([change("data/catalog/episodes.json", [episode()], [])])
        .lowRiskOnly,
    ).toBe(false);
  });

  it("rejects non-whitelisted episode fields", () => {
    expect(
      assessChangeScope([
        change(
          "data/catalog/episodes.json",
          [episode()],
          [episode({ guestIds: ["person_123456789abc"] })],
        ),
      ]).lowRiskOnly,
    ).toBe(false);
  });

  it("rejects source changes for an already verified entity", () => {
    const before = [episode({ verificationStatus: "verified" })];
    const after = [
      episode({
        verificationStatus: "verified",
        sources: [
          {
            kind: "official_episode",
            url: "https://bumingbai.net/episodes/other/",
            retrievedAt: "2026-07-18T00:00:00.000Z",
          },
        ],
      }),
    ];

    expect(
      assessChangeScope([change("data/catalog/episodes.json", before, after)])
        .lowRiskOnly,
    ).toBe(false);
  });

  it("rejects malformed catalog records", () => {
    expect(
      assessChangeScope([
        change(
          "data/catalog/episodes.json",
          [episode()],
          [episode({ number: 0, duration: "1:02:03" })],
        ),
      ]).lowRiskOnly,
    ).toBe(false);
  });

  it("allows guestIds for an existing unchanged person", () => {
    const guest = person();
    const people = [guest];
    expect(
      assessChangeScope(
        [
          change(
            "data/catalog/episodes.json",
            [episode()],
            [episode({ guestIds: [guest.id] })],
          ),
        ],
        { people: { before: people, after: people } },
      ).lowRiskOnly,
    ).toBe(true);
  });

  it("rejects guestIds for a person added only in head", () => {
    const guest = person();
    expect(
      assessChangeScope(
        [
          change(
            "data/catalog/episodes.json",
            [episode()],
            [episode({ guestIds: [guest.id] })],
          ),
        ],
        { people: { before: [], after: [guest] } },
      ).lowRiskOnly,
    ).toBe(false);
  });
});

describe("checkChangeScope", () => {
  it("rejects deletion of a raw snapshot in a real Git diff", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-scope-git-"));
    const rawDirectory = join(root, "data", "raw", "official");
    const rawPath = join(rawDirectory, "snapshot.json");
    try {
      await mkdir(rawDirectory, { recursive: true });
      await writeFile(
        rawPath,
        JSON.stringify(rawSnapshot) + String.fromCharCode(10),
        "utf8",
      );
      await git(root, "init");
      await git(root, "config", "user.name", "Scope Test");
      await git(root, "config", "user.email", "scope.invalid");
      await git(root, "add", ".");
      await git(root, "commit", "-m", "test: add snapshot");
      const base = await git(root, "rev-parse", "HEAD");
      await rm(rawPath);
      await git(root, "add", "-A");
      await git(root, "commit", "-m", "test: delete snapshot");
      const head = await git(root, "rev-parse", "HEAD");

      const result = await checkChangeScope(root, base, head);

      expect(result.lowRiskOnly).toBe(false);
      expect(result.reasons).toContain(
        "Raw official snapshots may only be added",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
