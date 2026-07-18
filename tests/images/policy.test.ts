import { describe, expect, it } from "vitest";
import { createStableId } from "../../src/domain/id.js";
import type { ImageAsset, Work } from "../../src/domain/schemas/catalog.js";
import {
  ImageAssetSchema,
  WorkSchema,
} from "../../src/domain/schemas/entities.js";
import { canUseAsThumbnail, selectHeroImage } from "../../src/images/policy.js";

const now = "2026-07-14T00:00:00.000Z";
const work: Work = WorkSchema.parse({
  id: "work_111111111111",
  slug: "speak-memory",
  verificationStatus: "verified",
  publicationStatus: "public",
  sources: [],
  title: "说吧，记忆",
  originalTitle: "Speak, Memory",
  mediaType: "book",
  creatorIds: ["person_111111111111"],
  topicIds: [],
  genres: ["memoir"],
  regions: ["United States"],
});
const base: ImageAsset = ImageAssetSchema.parse({
  id: "image_111111111111",
  workId: work.id,
  role: "edition",
  editionRole: "regional",
  handling: "hotlink_only",
  url: "https://images.example.org/cover.jpg",
  sourcePageUrl: "https://images.example.org/record",
  width: 800,
  height: 1200,
  license: "provider terms",
  attribution: "Example",
  lastVerifiedAt: now,
  broken: false,
});
const original: ImageAsset = ImageAssetSchema.parse({
  ...base,
  id: "image_222222222222",
  role: "hero",
  editionRole: "original",
});
const translated: ImageAsset = ImageAssetSchema.parse({
  ...base,
  id: "image_333333333333",
  editionRole: "translated",
});

describe("selectHeroImage", () => {
  it("prefers an eligible original image over a translated edition", () => {
    expect(selectHeroImage(work, [translated, original], now).id).toBe(
      original.id,
    );
  });

  it("rejects a low resolution original", () => {
    const lowResolution = ImageAssetSchema.parse({
      ...original,
      width: 200,
      height: 300,
    });
    expect(selectHeroImage(work, [lowResolution, translated], now).id).toBe(
      translated.id,
    );
  });

  it("rejects display prohibited images", () => {
    const prohibited = ImageAssetSchema.parse({
      ...original,
      handling: "display_prohibited",
    });
    expect(selectHeroImage(work, [prohibited], now).editionRole).toBe(
      "generated",
    );
  });

  it("uses the larger dimension for image eligibility", () => {
    const narrowButEligible = ImageAssetSchema.parse({
      ...original,
      width: 200,
      height: 600,
    });

    expect(selectHeroImage(work, [narrowButEligible], now).id).toBe(
      narrowButEligible.id,
    );
  });

  it("ranks original hero, original, translated, and regional candidates", () => {
    const originalEdition = ImageAssetSchema.parse({
      ...original,
      id: "image_444444444444",
      role: "edition",
    });

    expect(
      selectHeroImage(work, [base, translated, originalEdition, original], now)
        .id,
    ).toBe(original.id);
  });

  it("uses area and stable ID to order same-rank candidates without mutating input", () => {
    const large = ImageAssetSchema.parse({
      ...original,
      id: "image_aaaaaaaaaaaa",
      width: 1000,
    });
    const equalAreaLaterId = ImageAssetSchema.parse({
      ...original,
      id: "image_cccccccccccc",
      width: 900,
      height: 1200,
    });
    const equalAreaEarlierId = ImageAssetSchema.parse({
      ...original,
      id: "image_bbbbbbbbbbbb",
      width: 900,
      height: 1200,
    });
    const candidates = [equalAreaLaterId, equalAreaEarlierId, large];

    const selected = selectHeroImage(work, candidates, now);

    expect(selected.id).toBe(large.id);
    expect(candidates).toEqual([equalAreaLaterId, equalAreaEarlierId, large]);
    expect(
      selectHeroImage(work, [equalAreaLaterId, equalAreaEarlierId], now).id,
    ).toBe(equalAreaEarlierId.id);
  });

  it("creates the specified deterministic generated fallback", () => {
    expect(selectHeroImage(work, [], now)).toEqual({
      id: createStableId("image", work.id, "generated-fallback"),
      workId: work.id,
      role: "fallback",
      editionRole: "generated",
      handling: "mirror_allowed",
      url: "/generated-covers/speak-memory.svg",
      sourcePageUrl: "site-generated:cover",
      width: 800,
      height: 1200,
      license: "site-generated",
      attribution: "不明白知识库",
      lastVerifiedAt: now,
      broken: false,
    });
  });
});

describe("canUseAsThumbnail", () => {
  it("accepts an image when either dimension reaches the thumbnail threshold", () => {
    expect(
      canUseAsThumbnail(
        ImageAssetSchema.parse({ ...base, width: 100, height: 240 }),
      ),
    ).toBe(true);
  });

  it("rejects broken, prohibited, and undersized images", () => {
    expect(
      canUseAsThumbnail(ImageAssetSchema.parse({ ...base, broken: true })),
    ).toBe(false);
    expect(
      canUseAsThumbnail(
        ImageAssetSchema.parse({ ...base, handling: "display_prohibited" }),
      ),
    ).toBe(false);
    expect(
      canUseAsThumbnail(
        ImageAssetSchema.parse({ ...base, width: 239, height: 100 }),
      ),
    ).toBe(false);
  });
});
