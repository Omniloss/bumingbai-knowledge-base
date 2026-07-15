import { createSlug, createStableId } from "../domain/id.js";
import type { Edition, Person } from "../domain/schemas/catalog.js";
import type {
  EditionId,
  SourceRef,
  WorkId,
} from "../domain/schemas/primitives.js";
import {
  compareConfidence,
  mergeSources,
  selectCanonical,
} from "./legacy-merge.js";
import { includePeople, type PeopleIndex } from "./legacy-people.js";
import type { LegacyRecommendation } from "./legacy-schema.js";
import { splitNames } from "./legacy-shared.js";
import {
  confidenceFromPublicationStatus,
  type MigrationConfidence,
  WITHHELD_CONFIDENCE,
} from "./legacy-status.js";

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

type EditionIndex = {
  readonly editions: ReadonlyMap<EditionId, Edition>;
  readonly editionByIsbn: ReadonlyMap<string, Edition>;
  readonly conflictEditionIds: ReadonlySet<EditionId>;
};

type EditionIntegrationResult = EditionIndex & {
  readonly edition: Edition | undefined;
  readonly conflictingEdition: Edition | undefined;
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

export function integrateEdition(
  index: EditionIndex,
  createdEdition: Edition | undefined,
  confidence: MigrationConfidence,
): EditionIntegrationResult {
  if (!createdEdition) {
    return { ...index, edition: undefined, conflictingEdition: undefined };
  }
  const existingEdition = index.editions.get(createdEdition.id);
  const mergeResult = existingEdition
    ? mergeEdition(
        existingEdition,
        createdEdition,
        confidence,
        index.conflictEditionIds.has(createdEdition.id),
      )
    : { edition: createdEdition, conflict: false };
  const priorEdition = createdEdition.isbn
    ? index.editionByIsbn.get(createdEdition.isbn)
    : undefined;
  return {
    edition: mergeResult.edition,
    conflictingEdition: existingEdition ?? priorEdition,
    editions: new Map([
      ...index.editions,
      [mergeResult.edition.id, mergeResult.edition] as const,
    ]),
    editionByIsbn:
      createdEdition.isbn && !priorEdition
        ? new Map([
            ...index.editionByIsbn,
            [createdEdition.isbn, createdEdition] as const,
          ])
        : index.editionByIsbn,
    conflictEditionIds: mergeResult.conflict
      ? new Set([...index.conflictEditionIds, createdEdition.id])
      : index.conflictEditionIds,
  };
}

function editionPayloadKey(edition: Edition): string {
  return [
    edition.workId,
    edition.language,
    edition.region ?? "",
    edition.title,
    edition.translatorIds.join("\u001f"),
    edition.publisher ?? "",
    edition.publishedAt ?? "",
    edition.isbn ?? "",
    edition.translationAssessment.status,
    edition.translationAssessment.summary,
  ].join("\u001e");
}

function mergeEdition(
  existing: Edition,
  candidate: Edition,
  candidateConfidence: MigrationConfidence,
  hasConflict: boolean,
): { readonly edition: Edition; readonly conflict: boolean } {
  const existingConfidence = confidenceFromPublicationStatus(
    existing.publicationStatus,
  );
  const order = compareConfidence(existingConfidence, candidateConfidence);
  const payloadConflict =
    editionPayloadKey(existing) !== editionPayloadKey(candidate);
  const conflict = hasConflict || (order === "equal" && payloadConflict);
  const selected =
    conflict || order === "equal"
      ? selectCanonical(existing, candidate, editionPayloadKey)
      : order === "left"
        ? existing
        : candidate;
  const selectedConfidence = conflict
    ? WITHHELD_CONFIDENCE
    : order === "left"
      ? existingConfidence
      : candidateConfidence;
  return {
    edition: {
      ...selected,
      verificationStatus: selectedConfidence.verificationStatus,
      publicationStatus: selectedConfidence.publicationStatus,
      sources: mergeSources(existing.sources, candidate.sources),
    },
    conflict,
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
