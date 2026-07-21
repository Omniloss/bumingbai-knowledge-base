type GeneratedCoverInput = {
  readonly title: string;
  readonly mediaLabel: string;
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}

function titleTokens(title: string): string[] {
  return title.match(/\s+|[\p{Script=Han}]|[A-Za-z0-9]+|[^\s]/gu) ?? [];
}

const MAX_TITLE_WIDTH = 576;
const MAX_LINE_CHARACTERS = 18;

function glyphUnits(character: string): number {
  if (/\p{Script=Han}/u.test(character)) return 1;
  if (/[A-Za-z0-9]/u.test(character)) return 0.62;
  if (/\s/u.test(character)) return 0.35;
  return 0.6;
}

function estimatedWidth(value: string, fontSize: number): number {
  return [...value].reduce(
    (width, character) => width + glyphUnits(character) * fontSize,
    0,
  );
}

function fitsLine(value: string, fontSize: number): boolean {
  return (
    [...value].length <= MAX_LINE_CHARACTERS &&
    estimatedWidth(value, fontSize) <= MAX_TITLE_WIDTH
  );
}

function fittingPrefix(value: string, fontSize: number): string {
  let prefix = "";
  for (const character of value) {
    if (prefix.length > 0 && !fitsLine(`${prefix}${character}`, fontSize)) {
      break;
    }
    prefix += character;
  }
  return prefix;
}

function boundedTitleLines(title: string, fontSize: number): string[] {
  const lines: string[] = [];
  let line = "";
  let pendingSpace = false;
  for (const token of titleTokens(title)) {
    if (/^\s+$/u.test(token)) {
      pendingSpace = line.length > 0;
      continue;
    }
    let content = `${pendingSpace ? " " : ""}${token}`;
    pendingSpace = false;
    if (fitsLine(`${line}${content}`, fontSize)) {
      line += content;
      continue;
    }
    if (line.length > 0) lines.push(line);
    line = "";
    content = content.trimStart();
    while (!fitsLine(content, fontSize)) {
      const prefix = fittingPrefix(content, fontSize);
      lines.push(prefix);
      content = content.slice(prefix.length);
    }
    line = content;
  }
  if (line.length > 0) lines.push(line);
  if (lines.length <= 4) return lines;
  const final = lines.slice(0, 4);
  let last = final[3] ?? "";
  while (last.length > 0 && !fitsLine(`${last}…`, fontSize)) {
    last = last.slice(0, -1);
  }
  final[3] = `${last}…`;
  return final;
}

function titleFontSize(title: string): number {
  if ([...title].length > 18) return 32;
  if ([...title].length > 12) return 40;
  if ([...title].length > 7) return 52;
  return 78;
}

export function renderGeneratedCoverSvg(input: GeneratedCoverInput): string {
  const rawTitle = input.title.normalize("NFKC").trim();
  const title = escapeXml(rawTitle);
  const mediaLabel = escapeXml(input.mediaLabel.normalize("NFKC").trim());
  const fontSize = titleFontSize(rawTitle);
  const titleLines = boundedTitleLines(rawTitle, fontSize);
  const lineHeight = Math.round(fontSize * 1.4);
  const firstLineY =
    520 - Math.round(((titleLines.length - 1) * lineHeight) / 2);
  const titleLineMarkup = titleLines
    .map(
      (line, index) =>
        `<tspan x="400" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="800" height="1200" role="img" aria-labelledby="title description">
  <title id="title">${title}</title>
  <desc id="description">不明白知识库生成的${mediaLabel}封面</desc>
  <rect width="800" height="1200" fill="#102f2a"/>
  <rect x="56" y="56" width="688" height="1088" rx="24" fill="#f2eadb"/>
  <path d="M112 264h576" stroke="#b04b31" stroke-width="10"/>
  <text x="112" y="188" fill="#102f2a" font-family="system-ui, sans-serif" font-size="34" letter-spacing="5">${mediaLabel}</text>
  <text x="400" y="${firstLineY}" fill="#102f2a" font-family="system-ui, sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle">${titleLineMarkup}</text>
  <text x="400" y="1038" fill="#624f40" font-family="system-ui, sans-serif" font-size="30" text-anchor="middle" letter-spacing="4">不明白知识库</text>
</svg>
`;
}
