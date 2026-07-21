import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync("src/styles/global.css", "utf8");
const designSystem = readFileSync("DESIGN.md", "utf8");

describe("Hero design contract", () => {
  it("owns block rhythm and one-off visual values instead of inheriting browser defaults", () => {
    expect(stylesheet).toMatch(
      /\.hero\s*>\s*:is\(h1,\s*p\)\s*{[^}]*margin:\s*0;/s,
    );
    expect(stylesheet).toMatch(
      /\.hero \.eyebrow\s*{[^}]*margin-bottom:\s*var\(--space-hero-eyebrow-title\);/s,
    );
    expect(stylesheet).toMatch(
      /\.hero h1\s*{[^}]*margin-bottom:\s*var\(--space-hero-title-copy\);/s,
    );
    expect(stylesheet).not.toMatch(/font-weight:\s*700\b/);
    expect(stylesheet).not.toMatch(/z-index:\s*10\b/);

    const tokenValues = {
      "--space-hero-eyebrow-title": "1.5rem",
      "--space-hero-title-copy": "1.5rem",
      "--weight-site-name": "700",
      "--layer-skip-link": "10",
    };
    for (const [token, value] of Object.entries(tokenValues)) {
      expect(designSystem).toContain(`\`${token}\``);
      expect(stylesheet).toContain(`${token}: ${value};`);
      expect(stylesheet).toContain(`var(${token})`);
    }
  });

  it("documents breakpoint and monospace usage truthfully", () => {
    expect(designSystem).not.toContain("`--breakpoint-header`");
    expect(designSystem).toContain("`breakpoint/header`");
    expect(designSystem).toContain("CSS 自定义属性");
    expect(designSystem).toMatch(/`--font-mono`[^\n]*眉题/);
  });
});
