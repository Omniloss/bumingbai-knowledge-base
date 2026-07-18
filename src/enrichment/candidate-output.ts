import { createStableId, normalizeIdentityText } from "../domain/id.js";
import type {
  ImageAsset,
  ReviewIssue,
  Work,
} from "../domain/schemas/catalog.js";
import type { ProviderName } from "../providers/types.js";
import type { ProviderCandidate } from "./provider-data.js";
import { wikimediaIdentityConflicts } from "./wikimedia-identity.js";

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
      ...(field === "creatorIds" ? normalizedNames(candidates) : candidates),
    ),
    entityId: work.id,
    field,
    reason: `提供方 ${provider} 候选与目录 ${field} 不一致`,
    candidates,
    source: { kind: "provider_api", url, retrievedAt },
    status: "open",
  };
}

function normalizedNames(names: readonly string[]): string[] {
  return [...new Set(names.map(normalizeIdentityText))].toSorted();
}

function sameNames(left: readonly string[], right: readonly string[]): boolean {
  const normalizedLeft = normalizedNames(left);
  const normalizedRight = normalizedNames(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((name, index) => name === normalizedRight[index])
  );
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
    if (!sameNames(candidate.value.authorNames, creatorNames)) {
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
  if (candidate.provider === "wikidata") {
    for (const conflict of wikimediaIdentityConflicts(work, candidate.value)) {
      issues.push(
        issue(
          work,
          candidate.provider,
          value.externalId,
          conflict.field,
          conflict.candidates,
          url,
          retrievedAt,
        ),
      );
    }
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
  const issues = conflictIssues(work, candidate, creatorNames, retrievedAt);
  const image =
    issues.length === 0 ? imageAsset(work, candidate, retrievedAt) : undefined;
  return {
    ...(image === undefined ? {} : { image }),
    issues,
  };
}
