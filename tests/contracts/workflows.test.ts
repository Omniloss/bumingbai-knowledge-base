import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";

const WorkflowStepSchema = z.looseObject({
  name: z.string().optional(),
  run: z.string().optional(),
  uses: z.string().optional(),
  with: z.record(z.string(), z.unknown()).optional(),
});

const WorkflowSchema = z.looseObject({
  on: z
    .looseObject({
      pull_request: z.unknown().optional(),
      push: z.unknown().optional(),
      schedule: z
        .array(z.looseObject({ cron: z.string().optional() }))
        .optional(),
      workflow_dispatch: z.unknown().optional(),
    })
    .optional(),
  permissions: z.record(z.string(), z.string()).optional(),
  jobs: z
    .record(
      z.string(),
      z.looseObject({
        steps: z.array(WorkflowStepSchema).optional(),
        permissions: z.unknown().optional(),
      }),
    )
    .optional(),
});

type Workflow = z.infer<typeof WorkflowSchema>;
type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

async function loadWorkflow(name: string): Promise<Workflow> {
  const text = await readFile(
    resolve(process.cwd(), ".github", "workflows", name),
    "utf8",
  );
  return WorkflowSchema.parse(parse(text));
}

function runs(workflow: Workflow, job: string): string[] {
  return (workflow.jobs?.[job]?.steps ?? [])
    .map((step) => step.run)
    .filter((run): run is string => run !== undefined);
}
function steps(workflow: Workflow, job: string): readonly WorkflowStep[] {
  return workflow.jobs?.[job]?.steps ?? [];
}

function expectRuntimeActions(workflow: Workflow, job: string): void {
  const actions = steps(workflow, job);
  expect(actions.map((step) => step.uses).filter(Boolean)).toEqual([
    "actions/checkout@v6",
    "pnpm/action-setup@v6",
    "oven-sh/setup-bun@v2",
    "actions/setup-node@v6",
  ]);
  expect(
    actions.find((step) => step.uses === "pnpm/action-setup@v6")?.with,
  ).toEqual({ version: "11.15.1" });
}

describe("GitHub Actions workflows", () => {
  it("runs the complete pull request checks with read-only permissions", async () => {
    const ci = await loadWorkflow("ci.yml");
    expectRuntimeActions(ci, "check");
    expect(ci.on?.pull_request).toBeDefined();
    expect(ci.permissions).toEqual({ contents: "read" });
    expect(runs(ci, "check")).toEqual(
      expect.arrayContaining([
        "script/ci",
        "script/build",
        "pnpm exec playwright test",
      ]),
    );
    expect(JSON.stringify(ci)).not.toContain("CLOUDFLARE_");
  });

  it("schedules sync without direct default-branch pushes", async () => {
    const sync = await loadWorkflow("sync.yml");
    expectRuntimeActions(sync, "sync");
    expect(sync.on?.schedule?.[0]?.cron).toBe("17 */6 * * *");
    expect(sync.on?.workflow_dispatch).toBeDefined();
    expect(steps(sync, "sync")[0]).toMatchObject({
      uses: "actions/checkout@v6",
      with: {
        "fetch-depth": 0,
        ref: ["$", "{{ github.event.repository.default_branch }}"].join(""),
      },
    });
    expect(sync.permissions).toEqual({
      contents: "write",
      "pull-requests": "write",
    });
    expect(runs(sync, "sync")).toEqual(
      expect.arrayContaining(["script/sync", "script/ci", "script/build"]),
    );
    expect(JSON.stringify(sync)).not.toContain("--no-verify");
    expect(JSON.stringify(sync)).not.toContain("push origin main");
  });
});
