import type { Work } from "../domain/schemas/catalog.js";
import type { WikimediaCandidate } from "./provider-data.js";

export type WikimediaIdentityConflict = {
  readonly field: "identity" | "mediaType" | "year";
  readonly candidates: string[];
  readonly stableIdCandidates: string[];
};

const COMPATIBLE_INSTANCE_OF = {
  book: new Set(["Q571", "Q7725634"]),
  documentary: new Set(["Q11424", "Q93204"]),
  film: new Set(["Q11424"]),
  other: new Set<string>(),
  podcast: new Set(["Q24634210"]),
  television: new Set(["Q15416", "Q5398426"]),
} as const satisfies Record<Work["mediaType"], ReadonlySet<string>>;

function canonicalIds(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted();
}

function canonicalYears(values: readonly number[]): string[] {
  return [...new Set(values)]
    .toSorted((left, right) => left - right)
    .map(String);
}

export function wikimediaIdentityConflicts(
  work: Work,
  candidate: WikimediaCandidate,
): WikimediaIdentityConflict[] {
  const conflicts: WikimediaIdentityConflict[] = [];
  const compatibleTypes = COMPATIBLE_INSTANCE_OF[work.mediaType];
  if (!candidate.instanceOf.some((id) => compatibleTypes.has(id))) {
    conflicts.push({
      field: "mediaType",
      candidates:
        candidate.instanceOf.length > 0
          ? candidate.instanceOf
          : ["missing P31"],
      stableIdCandidates:
        candidate.instanceOf.length > 0
          ? canonicalIds(candidate.instanceOf)
          : ["missing P31"],
    });
  }

  if (work.year === undefined || candidate.publicationYears.length === 0) {
    conflicts.push({
      field: "identity",
      candidates:
        candidate.publicationYears.length > 0
          ? candidate.publicationYears.map(String)
          : ["missing publication year"],
      stableIdCandidates:
        candidate.publicationYears.length > 0
          ? canonicalYears(candidate.publicationYears)
          : ["missing publication year"],
    });
  } else if (!candidate.publicationYears.includes(work.year)) {
    conflicts.push({
      field: "year",
      candidates: [
        String(work.year),
        ...candidate.publicationYears.map(String),
      ],
      stableIdCandidates: [
        String(work.year),
        ...canonicalYears(candidate.publicationYears),
      ],
    });
  }

  return conflicts;
}
