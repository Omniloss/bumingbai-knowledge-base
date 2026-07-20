import { z } from "zod";
import { EpisodeSchema, PersonSchema } from "../domain/schemas/entities.js";
import { LOW_RISK_OFFICIAL_FIELDS } from "./classify-change.js";

export type CatalogKind = "episodes" | "people";
type ParsedEntity = Record<string, unknown> & { id: string };
export type ParsedCatalog = Map<string, ParsedEntity>;
export type ParsedPeopleCatalogs = {
  before: ParsedCatalog;
  after: ParsedCatalog;
};
export type ParsedCatalogResult = {
  entities?: ParsedCatalog;
  reason?: string;
};

const EPISODE_LOW_RISK_FIELDS: ReadonlySet<string> = new Set(
  LOW_RISK_OFFICIAL_FIELDS.filter((field) => field !== "guestNames"),
);

export function sameValue(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameKeys(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index])
  );
}

export function parseCatalogArray(
  path: string,
  value: unknown,
  kind: CatalogKind,
): ParsedCatalogResult {
  const label = kind === "episodes" ? "Episode" : "Person";
  const invalid = (): ParsedCatalogResult => ({
    reason: `${path} must contain valid unique ${label} records`,
  });
  if (!Array.isArray(value)) return invalid();

  try {
    const parsed = (
      kind === "episodes" ? z.array(EpisodeSchema) : z.array(PersonSchema)
    ).safeParse(value);
    if (!parsed.success) return invalid();

    const parsedEntities = parsed.data as readonly unknown[];
    const entities = new Map<string, ParsedEntity>();
    for (const [index, rawEntity] of value.entries()) {
      const parsedEntity = parsedEntities[index];
      if (
        !isRecord(rawEntity) ||
        !isRecord(parsedEntity) ||
        !sameKeys(rawEntity, parsedEntity)
      )
        return invalid();
      const id = (parsedEntity as { id?: unknown }).id;
      if (typeof id !== "string" || entities.has(id)) return invalid();
      entities.set(id, parsedEntity as ParsedEntity);
    }
    return { entities };
  } catch {
    return invalid();
  }
}

export function inspectCatalogChange(
  change: { path: string; before: unknown; after: unknown },
  kind: CatalogKind,
  peopleCatalogs: ParsedPeopleCatalogs | undefined,
): string[] {
  const before = parseCatalogArray(change.path, change.before, kind);
  const after = parseCatalogArray(change.path, change.after, kind);
  if (before.entities === undefined || after.entities === undefined)
    return [
      before.reason ??
        after.reason ??
        `${change.path} must contain valid catalog records`,
    ];

  const reasons: string[] = [];
  const changedGuestRefs = new Set<string>();
  let guestIdsChanged = false;
  for (const [id, previous] of before.entities) {
    const current = after.entities.get(id);
    if (current === undefined) {
      reasons.push(`${change.path} deletes ${id}`);
      continue;
    }

    for (const field of new Set([
      ...Object.keys(previous),
      ...Object.keys(current),
    ])) {
      if (field === "id" || sameValue(previous[field], current[field]))
        continue;
      if (kind === "episodes" && field === "guestIds") {
        guestIdsChanged = true;
        for (const guestId of [previous[field], current[field]]) {
          if (Array.isArray(guestId))
            for (const value of guestId)
              if (typeof value === "string") changedGuestRefs.add(value);
        }
        continue;
      }
      if (kind === "episodes" && EPISODE_LOW_RISK_FIELDS.has(field)) continue;
      reasons.push(
        field === "sources"
          ? `${change.path} changes sources for ${id}`
          : `${change.path} changes non-whitelisted field ${field} for ${id}`,
      );
    }
  }

  for (const id of after.entities.keys())
    if (!before.entities.has(id)) reasons.push(`${change.path} adds ${id}`);

  if (kind === "episodes" && guestIdsChanged) {
    if (peopleCatalogs === undefined) {
      reasons.push(
        `${change.path} changes guestIds without unchanged people catalogs`,
      );
    } else {
      for (const guestId of changedGuestRefs) {
        if (
          !peopleCatalogs.before.has(guestId) ||
          !peopleCatalogs.after.has(guestId)
        )
          reasons.push(
            `${change.path} guestIds references a Person missing from both catalogs`,
          );
      }
    }
  }
  return reasons;
}
