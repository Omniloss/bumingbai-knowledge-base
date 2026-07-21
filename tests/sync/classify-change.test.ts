import { describe, expect, it } from "vitest";
import { classifyField } from "../../src/sync/classify-change.js";

describe("classifyField", () => {
  it.each([
    "number",
    "title",
    "publishedAt",
    "duration",
    "officialUrl",
    "transcriptUrl",
    "guestNames",
  ])("classifies %s as low risk", (field) =>
    expect(classifyField(field)).toBe("low"));

  it.each([
    "recommendations",
    "creator",
    "originalTitle",
    "editions",
    "translationAssessment",
    "imageAssets",
  ])("classifies %s as high risk", (field) =>
    expect(classifyField(field)).toBe("high"));
});
