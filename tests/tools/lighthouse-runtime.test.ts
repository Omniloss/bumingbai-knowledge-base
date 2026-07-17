import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

test("Lighthouse uses Node 24 because Bun cannot complete Chrome CDP pipe startup on Windows", async () => {
  const packageJson = await readFile(
    path.join(process.cwd(), "package.json"),
    "utf8",
  );

  expect(packageJson).toContain(
    '"qa:lighthouse": "node --experimental-strip-types tools/lighthouse-task6.ts"',
  );
});
