import { createStableId } from "../domain/id.js";
import type { Catalog, ImageAsset } from "../domain/schemas/catalog.js";
import { selectHeroImage } from "../images/policy.js";

function compareId(left: ImageAsset, right: ImageAsset): number {
  return left.id.localeCompare(right.id);
}

export function mergeImages(
  catalog: Catalog,
  incoming: readonly ImageAsset[],
  removedIds: ReadonlySet<string>,
  now: string,
): ImageAsset[] {
  const byId = new Map<string, ImageAsset>();
  for (const image of catalog.imageAssets) {
    if (!removedIds.has(image.id)) byId.set(image.id, image);
  }
  for (const image of incoming) byId.set(image.id, image);

  for (const work of catalog.works) {
    const workImages = [...byId.values()]
      .filter((image) => image.workId === work.id)
      .map((image) =>
        image.editionRole !== "generated" && image.role === "hero"
          ? { ...image, role: "edition" as const }
          : image,
      );
    const selected = selectHeroImage(work, workImages, now);
    if (selected.editionRole === "generated") {
      byId.set(selected.id, selected);
    } else {
      for (const image of workImages) {
        byId.set(
          image.id,
          image.id === selected.id
            ? { ...image, role: "hero" }
            : image.editionRole === "generated"
              ? image
              : { ...image, role: "edition" },
        );
      }
      const fallbackId = createStableId("image", work.id, "generated-fallback");
      if (!byId.has(fallbackId)) {
        const fallback = selectHeroImage(work, [], now);
        byId.set(fallback.id, fallback);
      }
    }
  }
  return [...byId.values()].sort(compareId);
}
