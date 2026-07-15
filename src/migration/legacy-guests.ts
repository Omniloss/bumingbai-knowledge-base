import { createStableId } from "../domain/id.js";
import type { ReviewIssue } from "../domain/schemas/catalog.js";
import type {
  EpisodeId,
  PersonId,
  SourceRef,
} from "../domain/schemas/primitives.js";
import { LegacyStatusMappingError } from "./legacy-error.js";
import { includePeople, type PeopleIndex } from "./legacy-people.js";
import type { LegacyGuestEvidence } from "./legacy-schema.js";
import { splitNames } from "./legacy-shared.js";
import {
  CONFIRMED_CONFIDENCE,
  LEGACY_REVIEW_REASONS,
} from "./legacy-status.js";

type GuestMigrationRequest = {
  readonly people: PeopleIndex;
  readonly rawGuest: string;
  readonly evidence: LegacyGuestEvidence;
  readonly episodeId: EpisodeId;
  readonly source: SourceRef;
};

export type GuestMigration = {
  readonly people: PeopleIndex;
  readonly ids: readonly PersonId[];
  readonly reviewIssues: readonly ReviewIssue[];
};

function isConfirmedEvidence(evidence: LegacyGuestEvidence): boolean {
  switch (evidence.kind) {
    case "confirmed":
      return true;
    case "withheld":
      return false;
    default:
      throw new LegacyStatusMappingError(evidence);
  }
}

function isPlaceholder(rawGuest: string): boolean {
  return (
    rawGuest === "未在标题或简介中明确列名" || rawGuest.includes("未逐一列名")
  );
}

export function migrateGuests(request: GuestMigrationRequest): GuestMigration {
  if (request.rawGuest.length === 0) {
    return { people: request.people, ids: [], reviewIssues: [] };
  }
  if (
    isConfirmedEvidence(request.evidence) &&
    !isPlaceholder(request.rawGuest)
  ) {
    const result = includePeople(request.people, {
      names: splitNames(request.rawGuest),
      role: "guest",
      source: request.source,
      confidence: CONFIRMED_CONFIDENCE,
    });
    return { ...result, reviewIssues: [] };
  }
  return {
    people: request.people,
    ids: [],
    reviewIssues: [
      {
        id: createStableId("issue", request.episodeId, "guestIds"),
        entityId: request.episodeId,
        field: "guestIds",
        reason: LEGACY_REVIEW_REASONS.GUEST_UNCONFIRMED,
        candidates: [request.rawGuest],
        source: request.source,
        status: "open",
      },
    ],
  };
}
