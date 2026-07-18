import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import type { RecommendationCandidate } from "../../src/sync/recommendation-parser.js";
import { writeRecommendationCandidateQueue } from "../../src/sync/run-sync.js";

function candidate(rawText: string): RecommendationCandidate {
  return {
    episodeNumber: 223,
    rawText,
    sourceUrl: "https://bumingbai.net/episodes/ep-223/",
    retrievedAt: "2026-07-18T00:00:00.000Z",
    locator: "html > body > p:nth-of-type(1)",
    risk: "high",
    status: "pending_verification",
  };
}

type QueueRejectionDiagnostic = {
  callIndex: number;
  errorName: string;
  message: string;
  filesystemCode?: string;
  path?: string;
  stackLocation?: string;
};

function sanitize(value: string, root: string): string {
  return value
    .replaceAll(root, "<temp-root>")
    .replaceAll(root.replaceAll("\\", "/"), "<temp-root>")
    .replaceAll(root.replaceAll("/", "\\"), "<temp-root>");
}

function pathRole(path: string, root: string): string {
  const difference = relative(resolve(root), resolve(path));
  const withinRoot =
    difference === "" ||
    (!difference.startsWith(`..${sep}`) && difference !== "..");
  return `${withinRoot ? "temp-root" : "outside-root"}:${basename(path)}`;
}

function errorDetails(error: unknown): {
  code?: unknown;
  path?: unknown;
  stack?: unknown;
} {
  if (typeof error !== "object" || error === null) return {};
  return {
    code: "code" in error ? error.code : undefined,
    path: "path" in error ? error.path : undefined,
    stack: "stack" in error ? error.stack : undefined,
  };
}

function rejectionDiagnostic(
  result: PromiseRejectedResult,
  callIndex: number,
  root: string,
): QueueRejectionDiagnostic {
  const error = result.reason;
  const details = errorDetails(error);
  const message = error instanceof Error ? error.message : String(error);
  const stack = typeof details.stack === "string" ? details.stack : "";
  const location = stack
    .split("\n")
    .find((line) => line.trimStart().startsWith("at "));
  const match = location?.match(/(?:^|[\\/])([^\\/():]+):(\d+):(\d+)/u);
  return {
    callIndex,
    errorName: error instanceof Error ? error.name : "NonErrorRejection",
    message: sanitize(message, root),
    ...(typeof details.code === "string"
      ? { filesystemCode: details.code }
      : {}),
    ...(typeof details.path === "string"
      ? { path: pathRole(details.path, root) }
      : {}),
    ...(match
      ? { stackLocation: `at ${match[1]}:${match[2]}:${match[3]}` }
      : {}),
  };
}

describe("cold-start recommendation queue writes", () => {
  it("normalizes rejected queue diagnostics without a temporary absolute path", () => {
    const root = "C:\\temp\\bumingbai-candidates-example";
    const error = Object.assign(
      new Error(`EACCES: denied ${root}\\data\\review\\sync-candidates.json`),
      {
        code: "EACCES",
        path: `${root}\\data\\review\\sync-candidates.json`,
        stack: `Error: denied\n    at write (${root}\\src\\run-sync.ts:88:9)`,
      },
    );

    const diagnostic = rejectionDiagnostic(
      { status: "rejected", reason: error },
      4,
      root,
    );

    expect(diagnostic).toEqual({
      callIndex: 4,
      errorName: "Error",
      message: "EACCES: denied <temp-root>\\data\\review\\sync-candidates.json",
      filesystemCode: "EACCES",
      path: "temp-root:sync-candidates.json",
      stackLocation: "at run-sync.ts:88:9",
    });
    expect(JSON.stringify(diagnostic)).not.toContain(root);
  });

  it("serializes twenty fresh-root calls and leaves the final caller's queue", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-candidates-"));
    const writes = Array.from({ length: 20 }, (_, index) =>
      writeRecommendationCandidateQueue(root, [candidate(`《${index}》`)]),
    );

    const results = await Promise.allSettled(writes);
    const diagnostics = results.flatMap((result, callIndex) =>
      result.status === "rejected"
        ? [rejectionDiagnostic(result, callIndex, root)]
        : [],
    );

    if (diagnostics.length > 0) {
      console.error(
        `RECOMMENDATION_QUEUE_REJECTIONS=${JSON.stringify(diagnostics)}`,
      );
    }

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(20);
    expect(diagnostics).toHaveLength(0);
    await expect(
      readFile(join(root, "data", "review", "sync-candidates.json"), "utf8"),
    ).resolves.toContain("《19》");
  }, 30_000);
});
