import { describe, expect, it } from "vitest";
import { parseSiteConfig } from "../../src/config/site.js";

describe("parseSiteConfig", () => {
  it("requires absolute public URLs", () => {
    expect(() =>
      parseSiteConfig({
        PUBLIC_SITE_URL: "",
        PUBLIC_REPOSITORY_URL: "",
      }),
    ).toThrow();
  });

  it("requires HTTPS public URLs", () => {
    expect(() =>
      parseSiteConfig({
        PUBLIC_SITE_URL: "http://example.com",
        PUBLIC_REPOSITORY_URL: "https://github.com/example/catalog",
      }),
    ).toThrow();
  });

  it("accepts HTTPS URLs", () => {
    expect(
      parseSiteConfig({
        PUBLIC_SITE_URL: "https://example.com",
        PUBLIC_REPOSITORY_URL: "https://github.com/example/catalog",
      }),
    ).toEqual({
      siteUrl: "https://example.com",
      repositoryUrl: "https://github.com/example/catalog",
    });
  });
});
