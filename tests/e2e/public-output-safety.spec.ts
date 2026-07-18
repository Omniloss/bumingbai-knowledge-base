import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const FORBIDDEN_PUBLIC_REVIEW_COPY =
  /候选(?:信息|记录)|待核验|审核记录|审查记录|评审记录|\breview (?:status|record)\b|\bcandidates?\b/iu;
const FORBIDDEN_NOTICE_COPY = /候选|核验|审核|审查|评审|review|candidate/iu;
const ANCHOR_HREF = /<a\b[^>]*\bhref=(["'])(.*?)\1/giu;
const IMAGE_SRC = /<img\b[^>]*\bsrc=(["'])(.*?)\1/giu;
const SAFE_ANCHOR_HREF =
  /^(?:https:\/\/[^\s\\]+|\/(?![/\\])[^\\\s]*|#[^\\\s]*)$/iu;
const SAFE_IMAGE_SRC = /^(?:https:\/\/[^\s\\]+|\/(?![/\\])[^\\\s]+)$/iu;

type SectionHeading = {
  readonly hasH1: boolean;
  readonly hasH2: boolean;
};

async function listHtmlFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? listHtmlFiles(entryPath)
        : entry.name.endsWith(".html")
          ? [entryPath]
          : [];
    }),
  );
  return nestedFiles.flat();
}

function topLevelSectionHeadings(html: string): readonly SectionHeading[] {
  const tags = html.match(/<\/?(?:main|section|h1|h2)\b[^>]*>/giu) ?? [];
  const sections: SectionHeading[] = [];
  let inMain = false;
  let sectionDepth = 0;
  let current: SectionHeading | undefined;

  for (const tag of tags) {
    const closing = tag.startsWith("</");
    const name = tag.match(/^<\/?([a-z0-9]+)/iu)?.[1]?.toLowerCase();
    if (name === "main") {
      inMain = !closing;
    } else if (name === "section") {
      if (closing) {
        sectionDepth -= 1;
        if (sectionDepth === 0 && current) sections.push(current);
      } else {
        if (inMain && sectionDepth === 0) {
          current = { hasH1: false, hasH2: false };
        }
        sectionDepth += 1;
      }
    } else if (!closing && current && sectionDepth === 1) {
      current = {
        hasH1: current.hasH1 || name === "h1",
        hasH2: current.hasH2 || name === "h2",
      };
    }
  }
  return sections;
}

test("all generated pages keep one h1 and no unsafe or nonpublic markup", async ({
  browserName: _browserName,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "one build-level pass is sufficient",
  );
  const distPath = path.join(process.cwd(), "dist");
  const files = await listHtmlFiles(distPath);

  expect(files.length).toBeGreaterThan(0);
  let scannedFiles = 0;
  for (const file of files) {
    const html = await readFile(file, "utf8");
    scannedFiles += 1;
    expect(html.match(/<h1(?:\s|>)/gu) ?? [], file).toHaveLength(1);
    expect(html, file).not.toContain("sync-candidates.json");
    expect(html, file).not.toMatch(FORBIDDEN_PUBLIC_REVIEW_COPY);
    expect(html, file).not.toContain('data-publication-status="withheld"');
    expect(html, file).not.toContain(
      'data-verification-status="pending_verification"',
    );
    expect(html, file).not.toContain('data-verification-status="rejected"');

    for (const anchor of html.matchAll(ANCHOR_HREF)) {
      const href = anchor[2] ?? "";
      expect(href, `${file}: ${href}`).toMatch(SAFE_ANCHOR_HREF);
    }
    for (const image of html.matchAll(IMAGE_SRC)) {
      const src = image[2] ?? "";
      expect(src, `${file}: ${src}`).toMatch(SAFE_IMAGE_SRC);
    }
    for (const notice of html.matchAll(
      /<p\b[^>]*class=["'][^"']*pending-notice[^"']*["'][^>]*>(.*?)<\/p>/giu,
    )) {
      expect(notice[1] ?? "", file).not.toMatch(FORBIDDEN_NOTICE_COPY);
    }
    for (const section of topLevelSectionHeadings(html)) {
      expect(section.hasH1 || section.hasH2, file).toBe(true);
    }
  }
  expect(scannedFiles).toBe(files.length);
  await expect(
    readFile("public/search-index.json", "utf8"),
  ).resolves.not.toContain("sync-candidates.json");
});
