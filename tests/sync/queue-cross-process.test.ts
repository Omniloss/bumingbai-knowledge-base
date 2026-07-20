import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

type ChildResult = { code: number | null; stderr: string };

function childResult(child: ReturnType<typeof spawn>): Promise<ChildResult> {
  return new Promise((resolveResult, rejectResult) => {
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", rejectResult);
    child.once("exit", (code) => resolveResult({ code, stderr }));
  });
}

it("serializes fresh queue-tree creation across processes", async () => {
  const root = await mkdtemp(join(tmpdir(), "bumingbai-cross-process-"));
  const moduleUrl = pathToFileURL(resolve("src", "sync", "run-sync.ts")).href;
  const program = `
    const { writeRecommendationCandidateQueue } = await import(${JSON.stringify(moduleUrl)});
    await new Promise((ready) => process.stdin.once("data", ready));
    const [root, rawText] = Bun.argv.slice(1);
    await writeRecommendationCandidateQueue(root, [{
      episodeNumber: 223,
      rawText,
      sourceUrl: "https://bumingbai.net/episodes/ep-223/",
      retrievedAt: "2026-07-18T00:00:00.000Z",
      locator: "html > body > p:nth-of-type(1)",
      risk: "high",
      status: "pending_verification",
    }]);
  `;
  const children = Array.from({ length: 6 }, (_, index) =>
    spawn("bun", ["-e", program, root, `process-${index}`], {
      cwd: process.cwd(),
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: true,
    }),
  );
  const results = children.map(childResult);
  for (const child of children) child.stdin?.end("start");

  await expect(Promise.all(results)).resolves.toEqual(
    Array.from({ length: 6 }, () => ({ code: 0, stderr: "" })),
  );
  await expect(
    readFile(join(root, "data", "review", "sync-candidates.json"), "utf8"),
  ).resolves.toMatch(/process-\d/u);
}, 30_000);
