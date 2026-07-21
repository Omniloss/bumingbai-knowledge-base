import type { Work } from "../domain/schemas/catalog.js";
import type { SourceRef } from "../domain/schemas/primitives.js";

export function appendSource(
  sources: readonly SourceRef[],
  source: SourceRef,
): readonly SourceRef[] {
  const exists = sources.some(
    (candidate) =>
      candidate.kind === source.kind &&
      candidate.url === source.url &&
      candidate.retrievedAt === source.retrievedAt &&
      candidate.locator === source.locator,
  );
  return exists ? sources : [...sources, source];
}

export function officialEpisodeSource(
  url: string,
  retrievedAt: string,
  locator?: string,
): SourceRef {
  return {
    kind: "official_episode",
    url,
    retrievedAt,
    ...(locator === undefined ? {} : { locator }),
  };
}

export function mapMediaType(value: string): Work["mediaType"] {
  if (value.includes("纪录片")) return "documentary";
  if (value.includes("电视剧") || value.includes("电视")) return "television";
  if (value.includes("影视") || value.includes("电影")) return "film";
  if (value.includes("播客")) return "podcast";
  if (value.includes("书籍") || value.includes("文本")) return "book";
  return "other";
}

export function splitNames(value: string): readonly string[] {
  return value
    .split(/[、,，/]/u)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}
