import { describe, expect, it } from "vitest";
import { validateCatalog } from "../../src/domain/publication.js";
import {
  catalog,
  edition,
  episode,
  GENERATED_AT,
  person,
  recommendation,
  SOURCE,
  work,
} from "./publication-fixture.js";

describe("validateCatalog entity references", () => {
  it("reports every remaining entity reference with stable messages", () => {
    const input = catalog({
      episodes: [episode({ guestIds: ["person_222222222222"] })],
      works: [
        work({
          publicationStatus: "withheld",
          creatorIds: ["person_333333333333"],
          seriesId: "work_222222222222",
        }),
      ],
      editions: [edition({ workId: "work_333333333333" })],
      recommendationEvidence: [
        recommendation({
          publicationStatus: "withheld",
          recommenderId: "person_444444444444",
        }),
      ],
      imageAssets: [
        {
          id: "image_111111111111",
          workId: "work_444444444444",
          editionId: "edition_222222222222",
          role: "edition",
          editionRole: "original",
          handling: "hotlink_only",
          url: "https://example.com/image.jpg",
          sourcePageUrl: SOURCE.url,
          width: 800,
          height: 1200,
          license: "CC BY 4.0",
          attribution: "Artist",
          lastVerifiedAt: GENERATED_AT,
          broken: false,
        },
      ],
      workRelations: [
        {
          id: "relation_111111111111",
          fromWorkId: "work_555555555555",
          toWorkId: "work_666666666666",
          kind: "editorial",
          reasons: ["Manual relation"],
          sources: [SOURCE],
        },
      ],
      providerRecords: [
        {
          id: "provider_111111111111",
          provider: "wikidata",
          entityId: "work_777777777777",
          externalId: "Q1",
          retrievedAt: GENERATED_AT,
          normalizedHash: "a".repeat(64),
        },
      ],
      reviewIssues: [
        {
          id: "issue_111111111111",
          entityId: "work_888888888888",
          field: "title",
          reason: "Mismatch",
          candidates: [],
          source: SOURCE,
          status: "open",
        },
      ],
    });

    expect(
      validateCatalog(input)
        .filter((issue) => issue.code === "missing_reference")
        .map((issue) => issue.message),
    ).toEqual(
      expect.arrayContaining([
        "Episode.guestIds references missing Person person_222222222222",
        "Work.creatorIds references missing Person person_333333333333",
        "Work.seriesId references missing Work work_222222222222",
        "RecommendationEvidence.recommenderId references missing Person person_444444444444",
        "ImageAsset.workId references missing Work work_444444444444",
        "ImageAsset.editionId references missing Edition edition_222222222222",
        "WorkRelation.fromWorkId references missing Work work_555555555555",
        "WorkRelation.toWorkId references missing Work work_666666666666",
        "ProviderRecord.entityId references missing Entity work_777777777777",
        "ReviewIssue.entityId references missing Entity work_888888888888",
      ]),
    );
  });

  it("accepts a catalog with every supported entity reference", () => {
    const author = person();
    const series = work({
      id: "work_222222222222",
      publicationStatus: "withheld",
      slug: "series-work",
      title: "Series Work",
    });
    const primary = work({ creatorIds: [author.id], seriesId: series.id });
    const translated = edition({ workId: primary.id });
    const input = catalog({
      episodes: [episode({ guestIds: [author.id] })],
      people: [author],
      works: [primary, series],
      editions: [translated],
      recommendationEvidence: [recommendation({ recommenderId: author.id })],
      imageAssets: [
        {
          id: "image_111111111111",
          workId: primary.id,
          editionId: translated.id,
          role: "edition",
          editionRole: "translated",
          handling: "hotlink_only",
          url: "https://example.com/image.jpg",
          sourcePageUrl: SOURCE.url,
          width: 800,
          height: 1200,
          license: "CC BY 4.0",
          attribution: "Artist",
          lastVerifiedAt: GENERATED_AT,
          broken: false,
        },
      ],
      workRelations: [
        {
          id: "relation_111111111111",
          fromWorkId: primary.id,
          toWorkId: series.id,
          kind: "same_series",
          reasons: ["Series"],
          sources: [SOURCE],
        },
      ],
      providerRecords: [
        {
          id: "provider_111111111111",
          provider: "wikidata",
          entityId: primary.id,
          externalId: "Q1",
          retrievedAt: GENERATED_AT,
          normalizedHash: "a".repeat(64),
        },
      ],
      reviewIssues: [
        {
          id: "issue_111111111111",
          entityId: primary.id,
          field: "title",
          reason: "Mismatch",
          candidates: [],
          source: SOURCE,
          status: "resolved",
        },
      ],
    });

    expect(validateCatalog(input)).toEqual([]);
  });
});
