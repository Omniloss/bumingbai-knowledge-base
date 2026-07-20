import { execFile as executeFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  openSyncPullRequest,
  syncPullRequestPlan,
} from "../../tools/open-sync-pr.js";

const execFile = promisify(executeFile);

async function git(cwd: string, args: readonly string[]): Promise<string> {
  return (
    await execFile("git", [...args], {
      cwd,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    })
  ).stdout.trim();
}

describe("syncPullRequestPlan", () => {
  it("selects the low-risk branch and enables auto-merge", () => {
    expect(syncPullRequestPlan(true)).toEqual({
      branch: "automation/episode-sync",
      commitMessage: "data: sync official episode metadata",
      title: "data: sync official episode metadata",
      body: "This PR updates verified low-risk episode metadata from official podcast sources.",
      autoMerge: true,
    });
  });

  it("selects the review branch without auto-merge", () => {
    expect(syncPullRequestPlan(false)).toEqual({
      branch: "automation/review-queue",
      commitMessage: "data: queue recommendation candidates",
      title: "data: queue recommendation candidates",
      body: "This PR queues source changes and recommendation candidates for manual review.",
      autoMerge: false,
    });
  });

  it("never selects the default branch", () => {
    expect(syncPullRequestPlan(true).branch).not.toBe("main");
    expect(syncPullRequestPlan(false).branch).not.toBe("main");
  });
});
describe("openSyncPullRequest", () => {
  it("drops inherited feature commits before creating a low-risk branch", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-sync-pr-"));
    const remote = join(root, "remote.git");
    const seed = join(root, "seed");
    const work = join(root, "work");
    try {
      await git(root, ["init", "--bare", remote]);
      await mkdir(seed, { recursive: true });
      await git(seed, ["init", "-b", "main"]);
      await git(seed, ["config", "user.name", "Test Author"]);
      await git(seed, ["config", "user.email", "test@example.com"]);
      await git(seed, ["config", "commit.gpgsign", "false"]);
      for (const path of [
        join(seed, "data", "catalog"),
        join(seed, "data", "raw", "official"),
        join(seed, "data", "review"),
      ]) {
        await mkdir(path, { recursive: true });
        await writeFile(join(path, ".gitkeep"), "", "utf8");
      }
      await writeFile(join(seed, "README.md"), "seed\n", "utf8");
      await git(seed, ["add", "."]);
      await git(seed, ["commit", "-m", "chore: seed test repository"]);
      await git(seed, ["remote", "add", "origin", remote]);
      await git(seed, ["push", "-u", "origin", "main"]);

      await git(root, ["clone", "--branch", "main", remote, work]);
      await git(work, ["config", "user.name", "Feature Author"]);
      await git(work, ["config", "user.email", "feature@example.com"]);
      await git(work, ["config", "commit.gpgsign", "false"]);
      await git(work, ["switch", "-c", "feature/manual-dispatch"]);
      await writeFile(join(work, "unrelated.txt"), "not sync data\n", "utf8");
      await git(work, ["add", "unrelated.txt"]);
      await git(work, ["commit", "-m", "feat: unrelated feature"]);

      const snapshotPath =
        "data/raw/official/2026-07-20T00-00-00.000Z-test.json";
      await writeFile(
        join(work, ...snapshotPath.split("/")),
        `${JSON.stringify(
          [
            {
              number: 1,
              title: "Episode one",
              publishedAt: "2026-07-20T00:00:00.000Z",
              officialUrl: "https://www.bumingbai.net/episode-one",
              guestNames: [],
              descriptionHtml: "",
              sourceKind: "official_rss",
              retrievedAt: "2026-07-20T00:00:00.000Z",
              contentHash: "a".repeat(64),
            },
          ],
          null,
          2,
        )}\n`,
        "utf8",
      );
      const ghCalls: string[][] = [];
      const result = await openSyncPullRequest(work, "main", {
        gh: async (args) => {
          ghCalls.push([...args]);
          if (args[1] === "list") return "";
          if (args[1] === "create") return "https://example.test/pull/1";
          return "";
        },
      });

      expect(result).toMatchObject({
        changed: true,
        plan: { branch: "automation/episode-sync", autoMerge: true },
      });
      expect(await git(work, ["rev-parse", "automation/episode-sync^"])).toBe(
        await git(work, ["rev-parse", "origin/main"]),
      );
      expect(
        await git(work, [
          "diff",
          "--name-only",
          "origin/main...automation/episode-sync",
        ]),
      ).toBe(snapshotPath);
      expect(
        ghCalls.some((args) => args[0] === "pr" && args[1] === "merge"),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
