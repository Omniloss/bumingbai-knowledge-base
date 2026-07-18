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

type SourceLine = { rawText: string; locator: string };
type ParagraphHeading =
  | { kind: "none" }
  | { kind: "boundary" }
  | { kind: "recommendation"; lines: SourceLine[] };

function normalizedText(element: Element): string {
  return element.textContent.trim();
}

function elementLocator(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current !== null) {
    const name = current.localName;
    if (name === "html" || name === "body") {
      parts.unshift(name);
      if (name === "html") break;
    } else {
      let position = 1;
      for (
        let sibling = current.previousElementSibling;
        sibling;
        sibling = sibling.previousElementSibling
      ) {
        if (sibling.localName === name) position += 1;
      }
      parts.unshift(`${name}:nth-of-type(${position})`);
    }
    current = current.parentElement;
  }
  return parts.join(" > ");
}

function isElement(node: ChildNode): node is Element {
  return node.nodeType === 1;
}

function isSemanticHeading(element: Element): boolean {
  return /^h[1-6]$/u.test(element.localName);
}

function approvedHeading(text: string): boolean {
  return RECOMMENDATION_HEADINGS.has(text);
}

function sourceLines(element: Element, start = 0): SourceLine[] {
  const children = Array.from(element.childNodes).slice(start);
  const hasBreak = children.some(
    (child) => isElement(child) && child.localName === "br",
  );
  const locator = elementLocator(element);
  const lines: SourceLine[] = [];
  let text = "";
  let line = 1;
  const append = () => {
    const rawText = text.trim();
    if (rawText.length > 0) {
      lines.push({
        rawText,
        locator: hasBreak ? `${locator}::line(${line})` : locator,
      });
    }
    text = "";
  };
  for (const child of children) {
    if (isElement(child) && child.localName === "br") {
      const hadText = text.trim().length > 0;
      append();
      if (hadText) line += 1;
    } else {
      text += child.textContent ?? "";
    }
  }
  append();
  return lines;
}

function paragraphHeading(element: Element): ParagraphHeading {
  if (element.localName !== "p") return { kind: "none" };
  if (approvedHeading(normalizedText(element)))
    return { kind: "recommendation", lines: [] };
  const children = Array.from(element.childNodes);
  const firstIndex = children.findIndex(
    (child) =>
      child.nodeType !== 3 || (child.textContent ?? "").trim().length > 0,
  );
  const first = children[firstIndex];
  if (
    first === undefined ||
    !isElement(first) ||
    !(first.localName === "strong" || first.localName === "b")
  ) {
    return { kind: "none" };
  }
  const token = normalizedText(first);
  const title =
    token.endsWith(":") || token.endsWith("：") ? token.slice(0, -1) : token;
  return approvedHeading(title)
    ? { kind: "recommendation", lines: sourceLines(element, firstIndex + 1) }
    : { kind: "boundary" };
}

function documentElements(root: Element): Element[] {
  const elements: Element[] = [];
  const pending: Array<{ element: Element; depth: number }> = [
    { element: root, depth: 0 },
  ];
  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry === undefined) break;
    if (entry.depth > MAX_DOM_DEPTH)
      throw new Error("Recommendation HTML exceeds maximum DOM depth");
    elements.push(entry.element);
    if (elements.length > MAX_DOM_NODES)
      throw new Error("Recommendation HTML exceeds maximum DOM nodes");
    const children = Array.from(entry.element.children);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined)
        pending.push({ element: child, depth: entry.depth + 1 });
    }
  }
  return elements;
}

function recommenderLabel(line: string): string | undefined {
  if (line.includes("《") || line.includes("》")) return undefined;
  const label = /^(.*?)[：:]$/u.exec(line)?.[1]?.trim();
  return label === undefined || label.length === 0 ? undefined : label;
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
  if (input.html.length > MAX_HTML_LENGTH)
    throw new Error("Recommendation HTML exceeds maximum length");
  const { document } = parseHTML("<html><body></body></html>");
  document.body.innerHTML = input.html;
  const elements = documentElements(document.body);
  const paragraphs = new Map<Element, ParagraphHeading>();
  for (const element of elements)
    paragraphs.set(element, paragraphHeading(element));

  const candidates: RecommendationCandidate[] = [];
  for (const [index, heading] of elements.entries()) {
    const paragraph = paragraphs.get(heading) ?? { kind: "none" };
    const recommendation =
      isSemanticHeading(heading) && approvedHeading(normalizedText(heading))
        ? { kind: "recommendation" as const, lines: [] }
        : paragraph;
    if (recommendation.kind !== "recommendation") continue;
    let recommender: string | undefined;
    for (const line of recommendation.lines)
      recommender = appendCandidate(candidates, line, input, recommender);
    if (recommendation.lines.length > 0) continue;
    for (let cursor = index + 1; cursor < elements.length; cursor += 1) {
      const element = elements[cursor];
      if (element === undefined) break;
      const boundary = paragraphs.get(element)?.kind ?? "none";
      if (isSemanticHeading(element) || boundary !== "none") break;
      if (element.localName !== "p" && element.localName !== "li") continue;
      for (const line of sourceLines(element))
        recommender = appendCandidate(candidates, line, input, recommender);
    }
  }
  return candidates;
}
