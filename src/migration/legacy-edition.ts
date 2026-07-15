import { createSlug, createStableId } from "../domain/id.js";
import type { Edition, Person } from "../domain/schemas/catalog.js";
import type { SourceRef, WorkId } from "../domain/schemas/primitives.js";
import { includePeople, type PeopleIndex } from "./legacy-people.js";
import type { LegacyRecommendation } from "./legacy-schema.js";
import { splitNames } from "./legacy-shared.js";
import type { MigrationConfidence } from "./legacy-status.js";

type EditionRequest = {
  readonly item: LegacyRecommendation;
  readonly workId: WorkId;
  readonly source: SourceRef;
  readonly confidence: MigrationConfidence;
};

type EditionResult = {
  readonly edition: Edition | undefined;
  readonly people: PeopleIndex;
};

export function createEdition(
  people: PeopleIndex,
  request: EditionRequest,
): EditionResult {
  const { item, source, workId } = request;
  const hasEditionData = Boolean(
    item.isbn || item.translator || item.publisher || item.publication_year,
  );
  if (!hasEditionData) return { edition: undefined, people };

  const translatorResult = includePeople(people, {
    names: splitNames(item.translator),
    role: "translator",
    source,
    confidence: request.confidence,
  });
  const id = createStableId(
    "edition",
    workId,
    item.isbn || item.translator,
    item.publisher,
  );
  const externalUrls = [item.item_source_url, item.metadata_source_url].filter(
    (url, index, urls) => url.length > 0 && urls.indexOf(url) === index,
  );
  const externalSources: readonly SourceRef[] = externalUrls.map((url) => ({
    kind: "external_reference",
    url,
    retrievedAt: source.retrievedAt,
  }));
  return {
    edition: {
      id,
      slug: `${createSlug(item.title)}-${id.slice(-6)}`,
      workId,
      language: "zh",
      title: item.title,
      translatorIds: translatorResult.ids,
      ...(item.publisher ? { publisher: item.publisher } : {}),
      ...(item.publication_year ? { publishedAt: item.publication_year } : {}),
      ...(item.isbn ? { isbn: item.isbn } : {}),
      translationAssessment: {
        status: "unverified",
        summary: "未核实，作品总评分不能代替翻译评价",
        sources: [],
      },
      verificationStatus: request.confidence.verificationStatus,
      publicationStatus: request.confidence.publicationStatus,
      sources: [source, ...externalSources],
    },
    people: translatorResult.people,
  };
}

export function editionsConflict(left: Edition, right: Edition): boolean {
  return (
    left.workId !== right.workId ||
    left.title !== right.title ||
    left.publisher !== right.publisher ||
    left.publishedAt !== right.publishedAt ||
    left.translatorIds.join("\u001f") !== right.translatorIds.join("\u001f")
  );
}

export function describeEdition(edition: Edition, people: PeopleIndex): string {
  const translatorNames = edition.translatorIds
    .map((id) => people.get(id)?.name)
    .filter((name): name is Person["name"] => name !== undefined)
    .join("、");
  return [
    edition.isbn ?? "无 ISBN",
    edition.publisher ?? "未知出版社",
    translatorNames || "未知译者",
    edition.publishedAt ?? "未知年份",
  ].join(" | ");
}
