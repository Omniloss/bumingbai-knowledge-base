import { describe, expect, it } from "vitest";
import { tokenizeForSearch } from "../../src/lib/search.js";

describe("tokenizeForSearch", () => {
  it("builds Chinese bigrams and Latin words", () => {
    // Given
    const value = "说吧，记忆 Speak Memory";

    // When
    const tokens = tokenizeForSearch(value);

    // Then
    expect(tokens).toEqual(
      expect.arrayContaining(["说吧", "吧记", "记忆", "speak", "memory"]),
    );
  });
});
