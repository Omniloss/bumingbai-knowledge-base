import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const PackageScriptsSchema = z.object({
  scripts: z.object({
    ci: z.string(),
  }),
});

describe("repository verification policy", () => {
  it("checks out text files with LF on every platform", async () => {
    const attributes = await readFile(
      path.join(process.cwd(), ".gitattributes"),
      "utf8",
    );

    expect(attributes).toMatch(/^\* text=auto eol=lf$/mu);
    expect(attributes).toMatch(/^\/work\/bumingbai_structured\.json -text$/mu);
  });

  it("runs the static build and browser suite in CI", async () => {
    const packageJson = PackageScriptsSchema.parse(
      JSON.parse(
        await readFile(path.join(process.cwd(), "package.json"), "utf8"),
      ),
    );

    expect(packageJson.scripts.ci).toContain("pnpm run build");
    expect(packageJson.scripts.ci).toContain("pnpm exec playwright test");
  });
});
