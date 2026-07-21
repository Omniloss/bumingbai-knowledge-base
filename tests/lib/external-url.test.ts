import { describe, expect, it } from "vitest";
import { getHttpsExternalUrl } from "../../src/lib/external-url.js";

describe("getHttpsExternalUrl", () => {
  it("keeps an HTTPS URL unchanged", () => {
    const url = "https://example.com/source?item=1";

    expect(getHttpsExternalUrl(url)).toBe(url);
  });

  it.each([
    "http://example.com/source",
    "mailto:editor@example.com",
    "javascript:alert(1)",
    "not a URL",
  ])("rejects a non-HTTPS external value: %s", (value) => {
    expect(getHttpsExternalUrl(value)).toBeUndefined();
  });
});
