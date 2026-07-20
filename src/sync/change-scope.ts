import {
  inspectCatalogChange,
  type ParsedPeopleCatalogs,
  parseCatalogArray,
  sameValue,
} from "./scope-catalog.js";
import { OfficialSnapshotListSchema } from "./sync-state.js";

export const CATALOG_PATHS = new Set([
  "data/catalog/episodes.json",
  "data/catalog/people.json",
]);
const REVIEW_QUEUE_PATH = "data/review/sync-candidates.json";

export type ScopeChangeStatus = "A" | "M" | "D";
export type ScopeFileChange = {
  path: string;
  before: unknown;
  after: unknown;
  status?: ScopeChangeStatus;
};
export type ScopeCatalogContext = { before: unknown; after: unknown };
export type ScopeAssessmentOptions = {
  people?: ScopeCatalogContext;
  peopleBefore?: unknown;
  peopleAfter?: unknown;
};
export type ChangeScopeResult = { lowRiskOnly: boolean; reasons: string[] };

export function normalizedPath(path: unknown): string | undefined {
  if (typeof path !== "string") return undefined;
  const value = path.replaceAll("\\", "/");
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("//") ||
    value.split("/").some((part) => part === "." || part === "..")
  )
    return undefined;
  return value;
}

export function isRawSnapshotPath(path: string): boolean {
  return path.startsWith("data/raw/official/");
}

function allowedPath(path: string): boolean {
  return (
    isRawSnapshotPath(path) ||
    CATALOG_PATHS.has(path) ||
    path === REVIEW_QUEUE_PATH
  );
}

function inspectRawSnapshotChange(change: ScopeFileChange): string[] {
  if (change.status !== "A") {
    return ["Raw official snapshots may only be added"];
  }
  if (
    !change.path.endsWith(".json") ||
    !OfficialSnapshotListSchema.safeParse(change.after).success
  ) {
    return ["Raw official snapshot additions must match the snapshot schema"];
  }
  return [];
}

function resolvePeopleContext(
  changes: ScopeFileChange[],
  options?: ScopeAssessmentOptions,
): ScopeCatalogContext | undefined {
  if (options !== undefined) {
    if (options.people !== undefined) return options.people;
    if (
      Object.hasOwn(options, "peopleBefore") ||
      Object.hasOwn(options, "peopleAfter")
    )
      return { before: options.peopleBefore, after: options.peopleAfter };
  }
  const peopleChange = changes.find(
    (change) => normalizedPath(change?.path) === "data/catalog/people.json",
  );
  return peopleChange === undefined
    ? undefined
    : { before: peopleChange.before, after: peopleChange.after };
}

export function assessChangeScope(
  changes: ScopeFileChange[],
  options?: ScopeAssessmentOptions,
): ChangeScopeResult {
  if (!Array.isArray(changes) || changes.length === 0)
    return { lowRiskOnly: false, reasons: ["No changed files"] };

  const reasons: string[] = [];
  const peopleContext = resolvePeopleContext(changes, options);
  let peopleCatalogs: ParsedPeopleCatalogs | undefined;
  if (peopleContext !== undefined) {
    const before = parseCatalogArray(
      "data/catalog/people.json",
      peopleContext.before,
      "people",
    );
    const after = parseCatalogArray(
      "data/catalog/people.json",
      peopleContext.after,
      "people",
    );
    if (before.entities === undefined || after.entities === undefined) {
      reasons.push(
        before.reason ??
          after.reason ??
          "data/catalog/people.json must contain valid Person records",
      );
    } else {
      peopleCatalogs = { before: before.entities, after: after.entities };
      if (!sameValue(peopleContext.before, peopleContext.after))
        reasons.push("data/catalog/people.json changes people data");
    }
  }

  for (const rawChange of changes) {
    if (rawChange === null || typeof rawChange !== "object") {
      reasons.push("Invalid changed file record");
      continue;
    }
    const change = rawChange as ScopeFileChange;
    const path = normalizedPath(change.path);
    if (path === undefined || !allowedPath(path)) {
      reasons.push(`Disallowed path: ${String(change.path)}`);
      continue;
    }
    if (path === REVIEW_QUEUE_PATH) {
      reasons.push("Review candidate queue changes require review");
      continue;
    }
    if (isRawSnapshotPath(path)) {
      reasons.push(...inspectRawSnapshotChange({ ...change, path }));
      continue;
    }
    if (path === "data/catalog/episodes.json") {
      reasons.push(
        ...inspectCatalogChange(
          { ...change, path },
          "episodes",
          peopleCatalogs,
        ),
      );
    } else if (path === "data/catalog/people.json") {
      reasons.push(
        ...inspectCatalogChange({ ...change, path }, "people", peopleCatalogs),
      );
    }
  }

  return {
    lowRiskOnly: reasons.length === 0,
    reasons: [...new Set(reasons)],
  };
}
