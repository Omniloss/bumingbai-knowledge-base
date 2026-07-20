import { execFile as executeFile } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { checkChangeScope } from "./check-change-scope.js";

const environment: NodeJS.ProcessEnv & { DEFAULT_BRANCH?: string } =
  process.env;

const execFile = promisify(executeFile);
const REVIEW_BRANCH = "automation/review-queue";
export type PullRequestCommand = (
  args: readonly string[],
  cwd: string,
) => Promise<string>;

export type SyncPullRequestDependencies = {
  readonly gh?: PullRequestCommand;
};

export type SyncPullRequestPlan = {
  readonly branch: "automation/episode-sync" | "automation/review-queue";
  readonly commitMessage: string;
  readonly title: string;
  readonly body: string;
  readonly autoMerge: boolean;
};

export function syncPullRequestPlan(lowRiskOnly: boolean): SyncPullRequestPlan {
  return lowRiskOnly
    ? {
        branch: "automation/episode-sync",
        commitMessage: "data: sync official episode metadata",
        title: "data: sync official episode metadata",
        body: "This PR updates verified low-risk episode metadata from official podcast sources.",
        autoMerge: true,
      }
    : {
        branch: REVIEW_BRANCH,
        commitMessage: "data: queue recommendation candidates",
        title: "data: queue recommendation candidates",
        body: "This PR queues source changes and recommendation candidates for manual review.",
        autoMerge: false,
      };
}

async function command(
  executable: "git" | "gh",
  args: readonly string[],
  cwd: string,
): Promise<string> {
  return (
    await execFile(executable, [...args], {
      cwd,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    })
  ).stdout.trim();
}

async function git(args: readonly string[], cwd: string): Promise<string> {
  return command("git", args, cwd);
}

async function gh(args: readonly string[], cwd: string): Promise<string> {
  return command("gh", args, cwd);
}

async function stageSyncData(cwd: string): Promise<string[]> {
  await git(
    ["add", "--all", "--", "data/catalog", "data/raw/official", "data/review"],
    cwd,
  );
  const output = await git(["diff", "--cached", "--name-only"], cwd);
  return output === "" ? [] : output.split(/\r?\n/u);
}

async function createLocalCommit(
  cwd: string,
  defaultBranch: string,
): Promise<boolean> {
  await git(["config", "user.name", "github-actions[bot]"], cwd);
  await git(
    [
      "config",
      "user.email",
      "41898282+github-actions[bot]@users.noreply.github.com",
    ],
    cwd,
  );
  await git(["check-ref-format", "--branch", defaultBranch], cwd);
  await git(
    [
      "fetch",
      "origin",
      `+refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`,
    ],
    cwd,
  );
  await git(
    ["switch", "-C", REVIEW_BRANCH, `refs/remotes/origin/${defaultBranch}`],
    cwd,
  );
  const paths = await stageSyncData(cwd);
  if (paths.length === 0) return false;
  await git(["commit", "-m", syncPullRequestPlan(false).commitMessage], cwd);
  return true;
}

async function classifyCommit(cwd: string): Promise<SyncPullRequestPlan> {
  const scope = await checkChangeScope(cwd, "HEAD^", "HEAD");
  const plan = syncPullRequestPlan(scope.lowRiskOnly);
  if (plan.branch !== REVIEW_BRANCH) {
    await git(["commit", "--amend", "-m", plan.commitMessage], cwd);
    await git(["branch", "-M", plan.branch], cwd);
  }
  return plan;
}

async function pushAutomationBranch(
  plan: SyncPullRequestPlan,
  cwd: string,
): Promise<void> {
  if (
    plan.branch !== "automation/episode-sync" &&
    plan.branch !== "automation/review-queue"
  )
    throw new Error("Refusing to push an unsupported branch");
  await git(["fetch", "origin", "--prune"], cwd);
  await git(
    [
      "push",
      "--force-with-lease",
      "--set-upstream",
      "origin",
      `HEAD:refs/heads/${plan.branch}`,
    ],
    cwd,
  );
}

async function createOrUpdatePullRequest(
  plan: SyncPullRequestPlan,
  defaultBranch: string,
  cwd: string,
  runGh: PullRequestCommand,
): Promise<string> {
  const existing = await runGh(
    [
      "pr",
      "list",
      "--head",
      plan.branch,
      "--base",
      defaultBranch,
      "--state",
      "open",
      "--json",
      "number",
      "--jq",
      ".[0].number",
    ],
    cwd,
  );
  let reference = existing;
  if (reference === "") {
    reference = await runGh(
      [
        "pr",
        "create",
        "--base",
        defaultBranch,
        "--head",
        plan.branch,
        "--title",
        plan.title,
        "--body",
        plan.body,
      ],
      cwd,
    );
  } else {
    await runGh(
      ["pr", "edit", reference, "--title", plan.title, "--body", plan.body],
      cwd,
    );
  }
  if (plan.autoMerge)
    await runGh(["pr", "merge", reference, "--auto", "--squash"], cwd);
  return reference;
}

export async function openSyncPullRequest(
  cwd = process.cwd(),
  defaultBranch = environment.DEFAULT_BRANCH ?? "main",
  dependencies: SyncPullRequestDependencies = {},
): Promise<
  | { readonly changed: false }
  | {
      readonly changed: true;
      readonly plan: SyncPullRequestPlan;
      readonly pullRequest: string;
    }
> {
  if (defaultBranch.startsWith("automation/"))
    throw new Error("Default branch cannot be an automation branch");
  const changed = await createLocalCommit(cwd, defaultBranch);
  if (!changed) return { changed: false };
  const plan = await classifyCommit(cwd);
  await pushAutomationBranch(plan, cwd);
  const pullRequest = await createOrUpdatePullRequest(
    plan,
    defaultBranch,
    cwd,
    dependencies.gh ?? gh,
  );
  return { changed: true, plan, pullRequest };
}

async function main(): Promise<void> {
  try {
    const result = await openSyncPullRequest();
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "unknown automation failure";
    process.stderr.write(`Open sync pull request failed: ${message}\n`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  void main();
