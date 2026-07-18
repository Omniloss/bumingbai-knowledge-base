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

export function renderGeneratedCoverSvg(input: GeneratedCoverInput): string {
  const title = escapeXml(input.title.normalize("NFKC").trim());
  const mediaLabel = escapeXml(input.mediaLabel.normalize("NFKC").trim());
  const fontSize =
    input.title.length > 24 ? 52 : input.title.length > 14 ? 64 : 78;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="800" height="1200" role="img" aria-labelledby="title description">
  <title id="title">${title}</title>
  <desc id="description">不明白知识库生成的${mediaLabel}封面</desc>
  <rect width="800" height="1200" fill="#102f2a"/>
  <rect x="56" y="56" width="688" height="1088" rx="24" fill="#f2eadb"/>
  <path d="M112 264h576" stroke="#b04b31" stroke-width="10"/>
  <text x="112" y="188" fill="#102f2a" font-family="system-ui, sans-serif" font-size="34" letter-spacing="5">${mediaLabel}</text>
  <text x="400" y="520" fill="#102f2a" font-family="system-ui, sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle">${title}</text>
  <text x="400" y="1038" fill="#624f40" font-family="system-ui, sans-serif" font-size="30" text-anchor="middle" letter-spacing="4">不明白知识库</text>
</svg>
`;
}
