import type { SourceRef } from "../domain/schemas/primitives.js";

export type DetailSource = {
  readonly attribution?: string;
  readonly kind: SourceRef["kind"] | "image";
  readonly label: string;
  readonly license?: string;
  readonly url: string;
};

function sameImage(left: DetailSource, right: DetailSource): boolean {
  return (
    left.kind === "image" &&
    right.kind === "image" &&
    left.url === right.url &&
    left.license === right.license &&
    left.attribution === right.attribution
  );
}

export function mergeDetailSources(
  sources: readonly DetailSource[],
): DetailSource[] {
  const merged: DetailSource[] = [];
  for (const source of sources) {
    if (source.kind === "image") {
      for (let index = merged.length - 1; index >= 0; index -= 1) {
        if (
          merged[index]?.url === source.url &&
          merged[index]?.kind !== "image"
        ) {
          merged.splice(index, 1);
        }
      }
      if (!merged.some((candidate) => sameImage(candidate, source))) {
        merged.push(source);
      }
      continue;
    }
    if (!merged.some((candidate) => candidate.url === source.url))
      merged.push(source);
  }
  return merged;
}
