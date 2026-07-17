import type { Catalog } from "../domain/schemas/catalog.js";
import {
  type SearchIndex,
  SearchIndexSchema,
  type SearchKind,
  type SearchRecord,
  SearchRecordSchema,
  tokenizeForSearch,
} from "./search.js";

const KIND_ORDER = {
  episode: 0,
  work: 1,
  person: 2,
  topic: 3,
} as const satisfies Record<SearchKind, number>;

type PublishableEntity = {
  readonly publicationStatus: "public" | "withheld";
  readonly verificationStatus:
    | "verified"
    | "partially_verified"
    | "pending_verification"
    | "rejected";
};

function isPublicEntity(entity: PublishableEntity): boolean {
  return (
    entity.publicationStatus === "public" &&
    (entity.verificationStatus === "verified" ||
      entity.verificationStatus === "partially_verified")
  );
}

function createSearchRecord(
  id: string,
  kind: SearchKind,
  title: string,
  aliases: readonly string[],
  url: string,
): SearchRecord {
  const uniqueAliases = [...new Set(aliases)].toSorted((left, right) =>
    left.localeCompare(right, "zh-CN"),
  );
  const tokens = [
    ...new Set([title, ...uniqueAliases].flatMap(tokenizeForSearch)),
  ].toSorted((left, right) => left.localeCompare(right, "zh-CN"));

  return SearchRecordSchema.parse({
    aliases: uniqueAliases,
    id,
    kind,
    title,
    tokens,
    url,
  });
}

export function buildSearchIndex(catalog: Catalog): SearchIndex {
  const records = [
    ...catalog.episodes
      .filter(isPublicEntity)
      .map((episode) =>
        createSearchRecord(
          episode.id,
          "episode",
          episode.title,
          episode.number === null
            ? []
            : [`${episode.number}`, `第 ${episode.number} 期`],
          `/episodes/${episode.slug}/`,
        ),
      ),
    ...catalog.works
      .filter(isPublicEntity)
      .map((work) =>
        createSearchRecord(
          work.id,
          "work",
          work.title,
          work.originalTitle ? [work.originalTitle] : [],
          `/works/${work.slug}/`,
        ),
      ),
    ...catalog.people
      .filter(isPublicEntity)
      .map((person) =>
        createSearchRecord(
          person.id,
          "person",
          person.name,
          person.aliases,
          `/people/${person.slug}/`,
        ),
      ),
    ...catalog.topics
      .filter(isPublicEntity)
      .map((topic) =>
        createSearchRecord(
          topic.id,
          "topic",
          topic.name,
          topic.aliases,
          `/topics/${topic.slug}/`,
        ),
      ),
  ].toSorted((left, right) => {
    const kindOrder = KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
    if (kindOrder !== 0) return kindOrder;

    const titleOrder = left.title.localeCompare(right.title, "zh-CN");
    return titleOrder || left.id.localeCompare(right.id);
  });

  return SearchIndexSchema.parse(records);
}

export function serializeSearchIndex(index: SearchIndex): string {
  return `${JSON.stringify(SearchIndexSchema.parse(index), null, 2)}\n`;
}
