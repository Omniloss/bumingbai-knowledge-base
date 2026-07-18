import { parseHTML } from "linkedom";

const RECOMMENDATION_HEADINGS = new Set([
  "嘉宾推荐",
  "嘉宾推荐书目",
  "本期推荐",
  "推荐作品",
]);
const MAX_HTML_LENGTH = 200_000;
const MAX_DOM_DEPTH = 64;
const MAX_DOM_NODES = 2_000;

export type RecommendationCandidate = {
  episodeNumber: number;
  recommenderLabel?: string;
  rawText: string;
  sourceUrl: string;
  retrievedAt: string;
  locator: string;
  risk: "high";
  status: "pending_verification";
};

export type RecommendationCandidateInput = {
  episodeNumber: number;
  html: string;
  sourceUrl: string;
  retrievedAt: string;
};

type SourceLine = {
  rawText: string;
  locator: string;
};

type RecommendationHeading = {
  lines: SourceLine[];
};

function normalizedText(element: Element): string {
  return element.textContent.trim();
}

function elementLocator(element: Element): string {
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

function isSemanticHeading(element: Element): boolean {
  return /^h[1-6]$/u.test(element.localName);
}

function approvedHeading(value: string): boolean {
  return RECOMMENDATION_HEADINGS.has(value);
}

function isElement(node: ChildNode): node is Element {
  return node.nodeType === 1;
}

function paragraphLines(element: Element): SourceLine[] {
  const children = Array.from(element.childNodes);
  const first = children.find(
    (child) =>
      child.nodeType !== 3 || (child.textContent ?? "").trim().length > 0,
  );
  if (
    first === undefined ||
    !isElement(first) ||
    !(first.localName === "strong" || first.localName === "b")
  ) {
    return [];
  }
  const token = (first.textContent ?? "").trim();
  const heading =
    token.endsWith(":") || token.endsWith("：") ? token.slice(0, -1) : token;
  if (!approvedHeading(heading)) return [];

  const lines: SourceLine[] = [];
  let line = "";
  let lineNumber = 0;
  for (const child of children.slice(children.indexOf(first) + 1)) {
    if (isElement(child) && child.localName === "br") {
      const rawText = line.trim();
      if (rawText.length > 0) {
        lineNumber += 1;
        lines.push({
          rawText,
          locator: `${elementLocator(element)}::line(${lineNumber})`,
        });
      }
      line = "";
    } else {
      line += child.textContent ?? "";
    }
  }
  const rawText = line.trim();
  if (rawText.length > 0) {
    lines.push({
      rawText,
      locator: `${elementLocator(element)}::line(${lineNumber + 1})`,
    });
  }
  return lines;
}

function recommendationHeading(
  element: Element,
): RecommendationHeading | undefined {
  if (isSemanticHeading(element) && approvedHeading(normalizedText(element))) {
    return { lines: [] };
  }
  if (element.localName !== "p") return undefined;
  if (approvedHeading(normalizedText(element))) return { lines: [] };
  const lines = paragraphLines(element);
  return lines.length > 0 ? { lines } : undefined;
}

function documentElements(root: Element): Element[] {
  const elements: Element[] = [];
  const pending: Array<{ element: Element; depth: number }> = [
    { element: root, depth: 0 },
  ];
  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry === undefined) break;
    if (entry.depth > MAX_DOM_DEPTH) {
      throw new Error("Recommendation HTML exceeds maximum DOM depth");
    }
    elements.push(entry.element);
    if (elements.length > MAX_DOM_NODES) {
      throw new Error("Recommendation HTML exceeds maximum DOM nodes");
    }
    const children = Array.from(entry.element.children);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        pending.push({ element: child, depth: entry.depth + 1 });
      }
    }
  }
  return elements;
}

function recommenderLabel(line: string): string | undefined {
  if (line.includes("《") || line.includes("》")) return undefined;
  const match = /^(.*?)[：:]$/u.exec(line);
  const label = match?.[1]?.trim();
  return label === undefined || label.length === 0 ? undefined : label;
}

function isSourceLine(element: Element): boolean {
  return element.localName === "p" || element.localName === "li";
}

function appendCandidate(
  candidates: RecommendationCandidate[],
  line: SourceLine,
  input: RecommendationCandidateInput,
  recommender: string | undefined,
): string | undefined {
  const label = recommenderLabel(line.rawText);
  if (label !== undefined) return label;
  candidates.push({
    episodeNumber: input.episodeNumber,
    ...(recommender === undefined ? {} : { recommenderLabel: recommender }),
    rawText: line.rawText,
    sourceUrl: input.sourceUrl,
    retrievedAt: input.retrievedAt,
    locator: line.locator,
    risk: "high",
    status: "pending_verification",
  });
  return recommender;
}

export function parseRecommendationCandidates(
  input: RecommendationCandidateInput,
): RecommendationCandidate[] {
  if (input.html.length > MAX_HTML_LENGTH) {
    throw new Error("Recommendation HTML exceeds maximum length");
  }
  const { document } = parseHTML("<html><body></body></html>");
  document.body.innerHTML = input.html;
  const elements = documentElements(document.body);
  const headings = new Map<Element, RecommendationHeading>();
  for (const element of elements) {
    const heading = recommendationHeading(element);
    if (heading !== undefined) headings.set(element, heading);
  }

  const candidates: RecommendationCandidate[] = [];
  for (const [index, heading] of elements.entries()) {
    const recommendation = headings.get(heading);
    if (recommendation === undefined) continue;
    let recommender: string | undefined;
    for (const line of recommendation.lines) {
      recommender = appendCandidate(candidates, line, input, recommender);
    }
    if (recommendation.lines.length > 0) continue;
    for (let cursor = index + 1; cursor < elements.length; cursor += 1) {
      const element = elements[cursor];
      if (element === undefined) break;
      if (isSemanticHeading(element) || headings.has(element)) break;
      if (!isSourceLine(element)) continue;
      const rawText = normalizedText(element);
      if (rawText.length === 0) continue;
      recommender = appendCandidate(
        candidates,
        { rawText, locator: elementLocator(element) },
        input,
        recommender,
      );
    }
  }
  return candidates;
}
