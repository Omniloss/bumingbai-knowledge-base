import { describe, expect, test } from "vitest";
import { resolveLighthouseUrl } from "../../tools/lighthouse-args";

describe("Lighthouse command arguments", () => {
  test("skips pnpm's literal separator before the preview URL", () => {
    expect(
      resolveLighthouseUrl([
        "node.exe",
        "tools/lighthouse-task6.ts",
        "--",
        "http://127.0.0.1:4321/",
      ]),
    ).toBe("http://127.0.0.1:4321/");
  });

  test("uses the local preview when no URL is supplied", () => {
    expect(
      resolveLighthouseUrl(["node.exe", "tools/lighthouse-task6.ts"]),
    ).toBe("http://127.0.0.1:4321/");
  });
});
