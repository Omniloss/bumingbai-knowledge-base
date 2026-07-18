import { parseHTML } from "linkedom";

const RECOMMENDATION_HEADINGS = new Set([
  "嘉宾推荐",
  "嘉宾推荐书目",
  "本期推荐",
  "推荐作品",
]);
const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";
const RECOMMENDATION_SECTION_SELECTOR = `${HEADING_SELECTOR}, p`;

export type RecommendationCandidate = {
  episodeNumber: number;
  recommenderLabel?: string;
  rawText: string;
  sourceUrl: string;
  locator: string;
  risk: "high";
  status: "pending_verification";
};

export type RecommendationCandidateInput = {
  episodeNumber: number;
  html: string;
  sourceUrl: string;
};

function normalizedText(element: Element): string {
  return element.textContent.trim();
}

function isRecommendationHeading(element: Element): boolean {
  return RECOMMENDATION_HEADINGS.has(normalizedText(element));
}

function isHeading(element: Element): boolean {
  return element.matches(HEADING_SELECTOR);
}

function isSectionBoundary(element: Element): boolean {
  return isHeading(element) || isRecommendationHeading(element);
}

function isSourceLine(element: Element): boolean {
  return element.matches("p, li");
}

function sourceLines(element: Element): Element[] {
  if (isSourceLine(element)) return [element];
  return Array.from(element.children).flatMap(sourceLines);
}

function sectionLines(heading: Element): Element[] {
  const lines: Element[] = [];
  let sibling = heading.nextElementSibling;
  while (sibling !== null && !isSectionBoundary(sibling)) {
    lines.push(...sourceLines(sibling));
    sibling = sibling.nextElementSibling;
  }
  return lines;
}

function recommenderLabel(line: string): string | undefined {
  if (line.includes("《") || line.includes("》")) return undefined;
  const match = /^(.*?)[：:]$/u.exec(line);
  const label = match?.[1]?.trim();
  return label === undefined || label.length === 0 ? undefined : label;
}

function locator(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current !== null) {
    const tagName = current.localName;
    if (tagName === "html" || tagName === "body") {
      parts.unshift(tagName);
      if (tagName === "html") break;
    } else {
      let position = 1;
      let previous = current.previousElementSibling;
      while (previous !== null) {
        if (previous.localName === tagName) position += 1;
        previous = previous.previousElementSibling;
      }
      parts.unshift(`${tagName}:nth-of-type(${position})`);
    }
    current = current.parentElement;
  }
  return parts.join(" > ");
}

export function parseRecommendationCandidates(
  input: RecommendationCandidateInput,
): RecommendationCandidate[] {
  const { document } = parseHTML("<html><body></body></html>");
  document.body.innerHTML = input.html;
  const candidates: RecommendationCandidate[] = [];

  for (const heading of document.querySelectorAll(
    RECOMMENDATION_SECTION_SELECTOR,
  )) {
    if (!isRecommendationHeading(heading)) continue;
    let currentRecommender: string | undefined;
    for (const lineElement of sectionLines(heading)) {
      const rawText = normalizedText(lineElement);
      if (rawText.length === 0) continue;
      const label = recommenderLabel(rawText);
      if (label !== undefined) {
        currentRecommender = label;
        continue;
      }
      candidates.push({
        episodeNumber: input.episodeNumber,
        ...(currentRecommender === undefined
          ? {}
          : { recommenderLabel: currentRecommender }),
        rawText,
        sourceUrl: input.sourceUrl,
        locator: locator(lineElement),
        risk: "high",
        status: "pending_verification",
      });
    }
  }

  return candidates;
}
