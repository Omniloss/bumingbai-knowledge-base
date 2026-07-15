import type { SourceRef } from "../domain/schemas/primitives.js";
import { LegacyStatusMappingError } from "./legacy-error.js";
import type { MigrationConfidence } from "./legacy-status.js";
import { WITHHELD_CONFIDENCE } from "./legacy-status.js";

export type ConfidenceOrder = "left" | "right" | "equal";

function assertNever(value: never): never {
  throw new LegacyStatusMappingError(value);
}

export function compareConfidence(
  left: MigrationConfidence,
  right: MigrationConfidence,
): ConfidenceOrder {
  switch (left.kind) {
    case "confirmed":
      switch (right.kind) {
        case "confirmed":
          return "equal";
        case "withheld":
          return "left";
        default:
          return assertNever(right);
      }
    case "withheld":
      switch (right.kind) {
        case "confirmed":
          return "right";
        case "withheld":
          return "equal";
        default:
          return assertNever(right);
      }
    default:
      return assertNever(left);
  }
}

function sourceKey(source: SourceRef): string {
  return [
    source.kind,
    source.url,
    source.retrievedAt,
    source.locator ?? "",
  ].join("\u001f");
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function mergeSources(
  left: readonly SourceRef[],
  right: readonly SourceRef[],
): readonly SourceRef[] {
  return [...left, ...right]
    .filter(
      (source, index, sources) =>
        sources.findIndex(
          (candidate) => sourceKey(candidate) === sourceKey(source),
        ) === index,
    )
    .toSorted((first, second) =>
      compareText(sourceKey(first), sourceKey(second)),
    );
}

export function selectCanonical<T>(
  left: T,
  right: T,
  key: (value: T) => string,
): T {
  return compareText(key(left), key(right)) <= 0 ? left : right;
}

export type MergeCandidate<T> = {
  readonly entity: T;
  readonly confidence: MigrationConfidence;
};

type SourcedEntity = {
  readonly sources: readonly SourceRef[];
};

export type CandidateResolution<T> = {
  readonly candidates: readonly MergeCandidate<T>[];
  readonly conflict: boolean;
  readonly confidence: MigrationConfidence;
  readonly highestCandidates: readonly T[];
  readonly selected: T;
  readonly sources: readonly SourceRef[];
};

function selectStronger<T>(
  left: MergeCandidate<T>,
  right: MergeCandidate<T>,
  key: (value: T) => string,
): MergeCandidate<T> {
  const order = compareConfidence(left.confidence, right.confidence);
  if (order === "left") return left;
  if (order === "right") return right;
  return selectCanonical(left, right, (candidate) => key(candidate.entity));
}

export function resolveCandidates<T extends SourcedEntity>(
  existing: readonly MergeCandidate<T>[],
  incoming: MergeCandidate<T>,
  key: (value: T) => string,
): CandidateResolution<T> {
  const candidates = [...existing, incoming];
  const strongest = existing.reduce(
    (selected, candidate) => selectStronger(selected, candidate, key),
    incoming,
  );
  const highest = candidates
    .filter(
      (candidate) =>
        compareConfidence(candidate.confidence, strongest.confidence) ===
        "equal",
    )
    .toSorted((left, right) =>
      compareText(key(left.entity), key(right.entity)),
    );
  const selectedKey = key(strongest.entity);
  const conflict = highest.some(
    (candidate) => key(candidate.entity) !== selectedKey,
  );
  return {
    candidates,
    conflict,
    confidence: conflict ? WITHHELD_CONFIDENCE : strongest.confidence,
    highestCandidates: highest.map((candidate) => candidate.entity),
    selected: strongest.entity,
    sources: mergeSources(
      [],
      candidates.flatMap((candidate) => candidate.entity.sources),
    ),
  };
}
