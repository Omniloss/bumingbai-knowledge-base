import { createHash } from "node:crypto";
import { normalizeIdentityText } from "../domain/id.js";
import type { Catalog, Work } from "../domain/schemas/catalog.js";
import type { WorkLookup } from "../providers/types.js";

export function buildWorkLookup(catalog: Catalog, work: Work): WorkLookup {
  const peopleById = new Map(
    catalog.people.map((person) => [person.id, person]),
  );
  const creatorNames = work.creatorIds
    .flatMap((creatorId) => {
      const creator = peopleById.get(creatorId);
      return creator === undefined ? [] : [creator.name];
    })
    .toSorted((left, right) => left.localeCompare(right));
  const base = {
    workId: work.id,
    title: work.title,
    creatorNames,
    mediaType: work.mediaType,
  };
  return {
    ...base,
    ...(work.originalTitle === undefined
      ? {}
      : { originalTitle: work.originalTitle }),
    ...(work.year === undefined ? {} : { year: work.year }),
  };
}

export function lookupFingerprint(lookup: WorkLookup): string {
  const normalized = {
    creatorNames: lookup.creatorNames.map(normalizeIdentityText).toSorted(),
    mediaType: lookup.mediaType,
    originalLanguage: lookup.originalLanguage ?? null,
    originalTitle:
      lookup.originalTitle === undefined
        ? null
        : normalizeIdentityText(lookup.originalTitle),
    title: normalizeIdentityText(lookup.title),
    workId: lookup.workId,
    year: lookup.year ?? null,
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function embeddingText(catalog: Catalog, work: Work): string {
  const topicsById = new Map(
    catalog.topics.map((topic) => [topic.id, topic.name]),
  );
  const fields = [
    work.title,
    work.originalTitle ?? "",
    work.mediaType,
    ...work.topicIds.flatMap((id) => {
      const name = topicsById.get(id);
      return name === undefined ? [] : [name];
    }),
    ...work.genres,
    ...work.regions,
  ];
  return fields
    .map((value) => value.normalize("NFKC").trim())
    .filter(Boolean)
    .join("\n");
}
