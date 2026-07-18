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

function boundedTitleLines(title: string): string[] {
  const limit = 18;
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
    if (line.length + content.length <= limit) {
      line += content;
      continue;
    }
    if (line.length > 0) lines.push(line);
    line = "";
    content = content.trimStart();
    while (content.length > limit) {
      lines.push(content.slice(0, limit));
      content = content.slice(limit);
    }
    line = content;
  }
  if (line.length > 0) lines.push(line);
  if (lines.length <= 4) return lines;
  const final = lines.slice(0, 4);
  const last = final[3] ?? "";
  final[3] = `${last.slice(0, limit - 1)}…`;
  return final;
}

export function renderGeneratedCoverSvg(input: GeneratedCoverInput): string {
  const rawTitle = input.title.normalize("NFKC").trim();
  const title = escapeXml(rawTitle);
  const mediaLabel = escapeXml(input.mediaLabel.normalize("NFKC").trim());
  const fontSize = rawTitle.length > 24 ? 52 : rawTitle.length > 14 ? 64 : 78;
  const titleLines = boundedTitleLines(rawTitle);
  const titleLineMarkup = titleLines
    .map(
      (line, index) =>
        `<tspan x="400" dy="${index === 0 ? 0 : 76}" textLength="576" lengthAdjust="spacingAndGlyphs">${escapeXml(line)}</tspan>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="800" height="1200" role="img" aria-labelledby="title description">
  <title id="title">${title}</title>
  <desc id="description">不明白知识库生成的${mediaLabel}封面</desc>
  <rect width="800" height="1200" fill="#102f2a"/>
  <rect x="56" y="56" width="688" height="1088" rx="24" fill="#f2eadb"/>
  <path d="M112 264h576" stroke="#b04b31" stroke-width="10"/>
  <text x="112" y="188" fill="#102f2a" font-family="system-ui, sans-serif" font-size="34" letter-spacing="5">${mediaLabel}</text>
  <text x="400" y="${520 - (titleLines.length > 2 ? 76 : 0)}" fill="#102f2a" font-family="system-ui, sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle">${titleLineMarkup}</text>
  <text x="400" y="1038" fill="#624f40" font-family="system-ui, sans-serif" font-size="30" text-anchor="middle" letter-spacing="4">不明白知识库</text>
</svg>
`;
}
