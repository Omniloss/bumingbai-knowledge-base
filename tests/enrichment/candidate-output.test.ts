import { describe, expect, it } from "vitest";
import { candidateOutput } from "../../src/enrichment/candidate-output.js";
import { OpenLibraryCandidateSchema } from "../../src/enrichment/provider-data.js";
import { catalogFixture, now } from "./fixture.js";

function output(authorNames: string[], creatorNames: string[]) {
  const work = catalogFixture().works[0];
  if (work === undefined) throw new Error("Expected fixture work");
  return candidateOutput(
    work,
    {
      provider: "open_library",
      value: OpenLibraryCandidateSchema.parse({
        externalId: "OL-AUTHORS",
        title: work.title,
        authorNames,
      }),
    },
    creatorNames,
    now,
  );
}

describe("candidateOutput author conflicts", () => {
  it("treats normalized author collections as order-insensitive sets", () => {
    expect(
      output(["Author B", "Author A", "Author B"], ["Author A", "Author B"])
        .issues,
    ).toEqual([]);
  });

  it.each([
    [
      "overlapping but different",
      ["Author A", "Author C"],
      ["Author A", "Author B"],
    ],
    ["missing", ["Author A"], ["Author A", "Author B"]],
    ["extra", ["Author A", "Author B", "Author C"], ["Author A", "Author B"]],
  ])("creates a short creator issue for %s author collections", (_caseName, authorNames, creatorNames) => {
    const issues = output(authorNames, creatorNames).issues;

    expect(issues).toEqual([
      expect.objectContaining({
        field: "creatorIds",
        candidates: authorNames,
      }),
    ]);
  });
});
