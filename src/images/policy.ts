import { createStableId } from "../domain/id.js";
import type { ImageAsset, Work } from "../domain/schemas/catalog.js";

function isEligible(asset: ImageAsset): boolean {
  return (
    asset.handling !== "display_prohibited" &&
    !asset.broken &&
    Math.max(asset.width, asset.height) >= 600
  );
}

function rank(asset: ImageAsset): number {
  if (asset.editionRole === "original" && asset.role === "hero") return 0;
  if (asset.editionRole === "original") return 1;
  if (asset.editionRole === "translated") return 2;
  if (asset.editionRole === "regional") return 3;
  return 4;
}

function compareCandidates(left: ImageAsset, right: ImageAsset): number {
  return (
    rank(left) - rank(right) ||
    right.width * right.height - left.width * left.height ||
    left.id.localeCompare(right.id)
  );
}

function generatedFallback(work: Work, generatedAt: string): ImageAsset {
  return {
    id: createStableId("image", work.id, "generated-fallback"),
    workId: work.id,
    role: "fallback",
    editionRole: "generated",
    handling: "mirror_allowed",
    url: `/generated-covers/${work.slug}.svg`,
    sourcePageUrl: "site-generated:cover",
    width: 800,
    height: 1200,
    license: "site-generated",
    attribution: "不明白知识库",
    lastVerifiedAt: generatedAt,
    broken: false,
  };
}

export function selectHeroImage(
  work: Work,
  candidates: ImageAsset[],
  generatedAt: string,
): ImageAsset {
  return (
    candidates.filter(isEligible).toSorted(compareCandidates)[0] ??
    generatedFallback(work, generatedAt)
  );
}

export function canUseAsThumbnail(asset: ImageAsset): boolean {
  return (
    asset.handling !== "display_prohibited" &&
    !asset.broken &&
    Math.max(asset.width, asset.height) >= 240
  );
}
