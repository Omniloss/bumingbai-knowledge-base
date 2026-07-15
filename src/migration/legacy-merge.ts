import type { SourceRef } from "../domain/schemas/primitives.js";
import { LegacyStatusMappingError } from "./legacy-error.js";
import type { MigrationConfidence } from "./legacy-status.js";

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
