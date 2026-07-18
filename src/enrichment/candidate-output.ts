import { createStableId, normalizeIdentityText } from "../domain/id.js";
import type {
  ImageAsset,
  ReviewIssue,
  Work,
} from "../domain/schemas/catalog.js";
import type { ProviderName } from "../providers/types.js";
import type { ProviderCandidate } from "./provider-data.js";

type CandidateOutput = {
  readonly image?: ImageAsset;
  readonly issues: ReviewIssue[];
};

function sourceUrl(candidate: ProviderCandidate, work: Work): string {
  if (candidate.provider === "open_library") {
    return `https://openlibrary.org/works/${encodeURIComponent(candidate.value.externalId)}`;
  }
  if (candidate.provider === "tmdb") {
    const path = work.mediaType === "television" ? "tv" : "movie";
    return `https://www.themoviedb.org/${path}/${encodeURIComponent(candidate.value.externalId)}`;
  }
  return candidate.value.sourcePageUrl;
}

function issue(
  work: Work,
  provider: ProviderName,
  externalId: string,
  field: string,
  candidates: string[],
  url: string,
  retrievedAt: string,
): ReviewIssue {
  return {
    id: createStableId(
      "issue",
      work.id,
      provider,
      externalId,
      field,
      ...candidates,
    ),
    entityId: work.id,
    field,
    reason: `提供方 ${provider} 候选与目录 ${field} 不一致`,
    candidates,
    source: { kind: "provider_api", url, retrievedAt },
    status: "open",
  };
}

function conflictIssues(
  work: Work,
  candidate: ProviderCandidate,
  creatorNames: readonly string[],
  retrievedAt: string,
): ReviewIssue[] {
  const value = candidate.value;
  const url = sourceUrl(candidate, work);
  const titles = new Set(
    [work.title, work.originalTitle].flatMap((title) =>
      title === undefined ? [] : [normalizeIdentityText(title)],
    ),
  );
  const issues: ReviewIssue[] = [];
  const candidateTitles =
    candidate.provider === "tmdb"
      ? [candidate.value.title, candidate.value.originalTitle]
      : [candidate.value.title];
  if (
    !candidateTitles.some((title) => titles.has(normalizeIdentityText(title)))
  ) {
    issues.push(
      issue(
        work,
        candidate.provider,
        value.externalId,
        "title",
        candidateTitles,
        url,
        retrievedAt,
      ),
    );
  }
  if (candidate.provider === "open_library" && creatorNames.length > 0) {
    const expected = new Set(creatorNames.map(normalizeIdentityText));
    if (
      !candidate.value.authorNames.some((name) =>
        expected.has(normalizeIdentityText(name)),
      )
    ) {
      issues.push(
        issue(
          work,
          candidate.provider,
          value.externalId,
          "creatorIds",
          candidate.value.authorNames,
          url,
          retrievedAt,
        ),
      );
    }
  }
  const candidateYear =
    candidate.provider === "open_library"
      ? candidate.value.firstPublishYear
      : candidate.provider === "tmdb"
        ? candidate.value.releaseYear
        : undefined;
  if (
    work.year !== undefined &&
    candidateYear !== undefined &&
    work.year !== candidateYear
  ) {
    issues.push(
      issue(
        work,
        candidate.provider,
        value.externalId,
        "year",
        [String(work.year), String(candidateYear)],
        url,
        retrievedAt,
      ),
    );
  }
  return issues;
}

function imageAsset(
  work: Work,
  candidate: ProviderCandidate,
  retrievedAt: string,
): ImageAsset | undefined {
  const id = createStableId(
    "image",
    work.id,
    candidate.provider,
    candidate.value.externalId,
  );
  if (
    candidate.provider === "open_library" &&
    candidate.value.cover !== undefined
  ) {
    const original =
      work.originalTitle === undefined ||
      normalizeIdentityText(candidate.value.title) ===
        normalizeIdentityText(work.originalTitle);
    return {
      id,
      workId: work.id,
      role: "edition",
      editionRole: original ? "original" : "translated",
      ...candidate.value.cover,
      license: "Open Library cover",
      attribution: "Open Library",
      lastVerifiedAt: retrievedAt,
      broken: false,
    };
  }
  if (candidate.provider === "tmdb" && candidate.value.poster !== undefined) {
    const original =
      candidate.value.poster.language === candidate.value.originalLanguage;
    const path = work.mediaType === "television" ? "tv" : "movie";
    return {
      id,
      workId: work.id,
      role: "edition",
      editionRole: original ? "original" : "regional",
      ...candidate.value.poster,
      sourcePageUrl: `https://www.themoviedb.org/${path}/${candidate.value.externalId}`,
      license: "TMDB image",
      attribution: "TMDB",
      lastVerifiedAt: retrievedAt,
      broken: false,
    };
  }
  if (
    candidate.provider === "wikidata" &&
    candidate.value.image !== undefined
  ) {
    const image = candidate.value.image;
    return {
      id,
      workId: work.id,
      role: "edition",
      editionRole: "original",
      handling: image.handling,
      url: image.url,
      sourcePageUrl: image.sourcePageUrl,
      width: image.width,
      height: image.height,
      license: image.license,
      attribution: image.attribution,
      lastVerifiedAt: retrievedAt,
      broken: false,
    };
  }
  return undefined;
}

export function candidateOutput(
  work: Work,
  candidate: ProviderCandidate,
  creatorNames: readonly string[],
  retrievedAt: string,
): CandidateOutput {
  const image = imageAsset(work, candidate, retrievedAt);
  return {
    ...(image === undefined ? {} : { image }),
    issues: conflictIssues(work, candidate, creatorNames, retrievedAt),
  };
}
