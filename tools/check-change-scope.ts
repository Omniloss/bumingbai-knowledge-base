import { execFile as executeFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  assessChangeScope,
  CATALOG_PATHS,
  type ChangeScopeResult,
  isRawSnapshotPath,
  normalizedPath,
  type ScopeAssessmentOptions,
  type ScopeChangeStatus,
  type ScopeFileChange,
} from "../src/sync/change-scope.js";

export type {
  ChangeScopeResult,
  ScopeAssessmentOptions,
  ScopeChangeStatus,
  ScopeFileChange,
};
export { assessChangeScope };

const execFile = promisify(executeFile);

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  return (
    await execFile("git", args, {
      cwd,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    })
  ).stdout;
}

async function readGitJson(
  cwd: string,
  revision: string,
  path: string,
): Promise<unknown> {
  try {
    return JSON.parse(await gitOutput(cwd, ["show", `${revision}:${path}`]));
  } catch {
    return undefined;
  }
}

export async function checkChangeScope(
  cwd: string,
  base: string,
  head: string,
): Promise<ChangeScopeResult> {
  const [baseCommit, headCommit] = await Promise.all([
    gitOutput(cwd, ["rev-parse", "--verify", `${base}^{commit}`]),
    gitOutput(cwd, ["rev-parse", "--verify", `${head}^{commit}`]),
  ]);
  const baseRevision = baseCommit.trim();
  const headRevision = headCommit.trim();
  const entries: { path: string; status?: ScopeChangeStatus }[] = (
    await gitOutput(cwd, [
      "diff",
      "--name-status",
      "--no-renames",
      baseRevision,
      headRevision,
      "--",
    ])
  )
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("\t");
      if (separator < 1) return { path: line };
      const rawStatus = line.slice(0, separator);
      const path = line.slice(separator + 1);
      return rawStatus === "A" || rawStatus === "M" || rawStatus === "D"
        ? { path, status: rawStatus }
        : { path };
    });

  const changes = await Promise.all(
    entries.map(async (entry) => {
      const normalized = normalizedPath(entry.path);
      if (
        normalized === undefined ||
        (!CATALOG_PATHS.has(normalized) && !isRawSnapshotPath(normalized))
      )
        return {
          ...entry,
          path: entry.path,
          before: undefined,
          after: undefined,
        };
      return {
        ...entry,
        path: normalized,
        before:
          entry.status === "A"
            ? undefined
            : await readGitJson(cwd, baseRevision, normalized),
        after:
          entry.status === "D"
            ? undefined
            : await readGitJson(cwd, headRevision, normalized),
      };
    }),
  );

  const episodesChanged = entries.some(
    (entry) => normalizedPath(entry.path) === "data/catalog/episodes.json",
  );
  const options: ScopeAssessmentOptions | undefined = episodesChanged
    ? {
        people: {
          before: await readGitJson(
            cwd,
            baseRevision,
            "data/catalog/people.json",
          ),
          after: await readGitJson(
            cwd,
            headRevision,
            "data/catalog/people.json",
          ),
        },
      }
    : undefined;
  return assessChangeScope(changes, options);
}

async function writeGithubOutput(result: ChangeScopeResult): Promise<void> {
  const line = `low_risk_only=${result.lowRiskOnly ? "true" : "false"}\n`;
  const environment: NodeJS.ProcessEnv & { GITHUB_OUTPUT?: string } =
    process.env;
  const githubOutput = environment.GITHUB_OUTPUT;
  if (githubOutput !== undefined) await appendFile(githubOutput, line, "utf8");
  process.stdout.write(line);
}

async function main(): Promise<void> {
  const [base, head] = process.argv.slice(2);
  if (base === undefined || head === undefined) {
    await writeGithubOutput({
      lowRiskOnly: false,
      reasons: ["Missing revisions"],
    });
    process.exitCode = 1;
    return;
  }
  try {
    await writeGithubOutput(await checkChangeScope(process.cwd(), base, head));
  } catch {
    await writeGithubOutput({
      lowRiskOnly: false,
      reasons: ["Scope check failed"],
    });
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  void main();
