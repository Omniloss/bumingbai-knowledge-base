import { describe, expect, it } from "vitest";
import { candidateOutput } from "../../src/enrichment/candidate-output.js";
import {
  OpenLibraryCandidateSchema,
  WikimediaCandidateSchema,
} from "../../src/enrichment/provider-data.js";
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

  it("uses normalized unique author names for a stable creator conflict ID", () => {
    const duplicateOrder = output(
      ["Author B", "Author A", "Author B"],
      ["Author A"],
    );
    const canonicalOrder = output(["Author A", "Author B"], ["Author A"]);

    expect(duplicateOrder.issues[0]?.id).toBe(canonicalOrder.issues[0]?.id);
    expect(duplicateOrder.issues[0]?.candidates).toEqual([
      "Author B",
      "Author A",
      "Author B",
    ]);
  });
});

describe("candidateOutput Wikidata identity", () => {
  const image = {
    artist: "Archive",
    attribution: "Archive",
    credit: "Archive",
    handling: "mirror_allowed" as const,
    height: 1800,
    license: "CC BY 4.0",
    sourcePageUrl: "https://commons.wikimedia.org/wiki/File:cover.jpg",
    url: "https://commons.wikimedia.org/cover.jpg",
    width: 1200,
  };

  function wikidataOutput(instanceOf: string[], publicationYears: number[]) {
    const work = catalogFixture().works[0];
    if (work === undefined) throw new Error("Expected fixture work");
    return candidateOutput(
      work,
      {
        provider: "wikidata",
        value: WikimediaCandidateSchema.parse({
          externalId: "Q-CANDIDATE",
          externalIds: {},
          image,
          instanceOf,
          license: "CC0",
          publicationYears,
          sourcePageUrl: "https://www.wikidata.org/wiki/Q-CANDIDATE",
          title: work.title,
        }),
      },
      [],
      now,
    );
  }

  it.each([
    ["same title but wrong P31", ["Q11424"], [2001], "mediaType"],
    ["compatible P31 but wrong year", ["Q571"], [1999], "year"],
    ["compatible P31 without an additional signal", ["Q571"], [], "identity"],
  ] as const)("reviews %s without publishing an image", (_caseName, instanceOf, years, field) => {
    const output = wikidataOutput([...instanceOf], [...years]);

    expect(output.image).toBeUndefined();
    expect(output.issues).toContainEqual(expect.objectContaining({ field }));
  });

  it("publishes the image for compatible P31 and exact publication year", () => {
    const output = wikidataOutput(["Q571"], [2001]);

    expect(output.issues).toEqual([]);
    expect(output.image?.url).toBe(image.url);
  });

  it.each([
    [
      "P31",
      ["Q11424", "Q24634210"],
      [2001],
      ["Q24634210", "Q11424", "Q24634210"],
      [2001],
      "mediaType",
    ],
    ["P577", ["Q571"], [1999, 2000], ["Q571"], [2000, 1999, 2000], "year"],
  ] as const)("uses a stable issue ID for reordered and duplicated %s claims", (_claim, firstTypes, firstYears, secondTypes, secondYears, field) => {
    const first = wikidataOutput([...firstTypes], [...firstYears]);
    const second = wikidataOutput([...secondTypes], [...secondYears]);

    expect(first.issues.find((issue) => issue.field === field)?.id).toBe(
      second.issues.find((issue) => issue.field === field)?.id,
    );
  });
});
