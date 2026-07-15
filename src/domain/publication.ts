import type { Catalog, RecommendationEvidence } from "./schemas/catalog.js";

export type ValidationIssue = {
  readonly code:
    | "duplicate_id"
    | "missing_reference"
    | "unsupported_translation_assessment"
    | "public_work_without_evidence";
  readonly entityId: string;
  readonly message: string;
};

type ReferenceCheck = {
  readonly entityId: string;
  readonly field: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly exists: boolean;
};

const ISSUE_PRIORITY = {
  duplicate_id: 0,
  missing_reference: 1,
  unsupported_translation_assessment: 2,
  public_work_without_evidence: 3,
} as const satisfies Record<ValidationIssue["code"], number>;

export function canPublishRecommendation(
  evidence: RecommendationEvidence,
): boolean {
  return (
    evidence.publicationStatus === "public" &&
    (evidence.verificationStatus === "verified" ||
      evidence.verificationStatus === "partially_verified") &&
    (evidence.source.kind === "official_episode" ||
      evidence.source.kind === "official_transcript" ||
      evidence.source.kind === "official_rss")
  );
}

function addMissingReference(
  issues: ValidationIssue[],
  check: ReferenceCheck,
): void {
  if (check.exists) return;
  issues.push({
    code: "missing_reference",
    entityId: check.entityId,
    message: `${check.field} references missing ${check.targetType} ${check.targetId}`,
  });
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function validateCatalog(catalog: Catalog): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const episodeIds = new Set(catalog.episodes.map((item) => item.id));
  const personIds = new Set(catalog.people.map((item) => item.id));
  const topicIds = new Set(catalog.topics.map((item) => item.id));
  const workIds = new Set(catalog.works.map((item) => item.id));

  const entityCollections: readonly (readonly {
    readonly id: string;
  }[])[] = [
    catalog.episodes,
    catalog.people,
    catalog.topics,
    catalog.works,
    catalog.editions,
    catalog.recommendationEvidence,
    catalog.imageAssets,
    catalog.workRelations,
    catalog.providerRecords,
    catalog.reviewIssues,
  ];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const entities of entityCollections) {
    for (const entity of entities) {
      if (seenIds.has(entity.id)) duplicateIds.add(entity.id);
      seenIds.add(entity.id);
    }
  }
  for (const entityId of duplicateIds) {
    issues.push({
      code: "duplicate_id",
      entityId,
      message: `Catalog contains duplicate entity ID ${entityId}`,
    });
  }

  for (const evidence of catalog.recommendationEvidence) {
    addMissingReference(issues, {
      entityId: evidence.id,
      field: "RecommendationEvidence.episodeId",
      targetType: "Episode",
      targetId: evidence.episodeId,
      exists: episodeIds.has(evidence.episodeId),
    });
    addMissingReference(issues, {
      entityId: evidence.id,
      field: "RecommendationEvidence.workId",
      targetType: "Work",
      targetId: evidence.workId,
      exists: workIds.has(evidence.workId),
    });
  }

  for (const edition of catalog.editions) {
    addMissingReference(issues, {
      entityId: edition.id,
      field: "Edition.workId",
      targetType: "Work",
      targetId: edition.workId,
      exists: workIds.has(edition.workId),
    });
    for (const translatorId of edition.translatorIds) {
      addMissingReference(issues, {
        entityId: edition.id,
        field: "Edition.translatorIds",
        targetType: "Person",
        targetId: translatorId,
        exists: personIds.has(translatorId),
      });
    }
    if (
      edition.translationAssessment.status === "verified" &&
      edition.translationAssessment.sources.length === 0
    ) {
      issues.push({
        code: "unsupported_translation_assessment",
        entityId: edition.id,
        message: "Verified translation assessment requires at least one source",
      });
    }
  }

  for (const episode of catalog.episodes) {
    for (const topicId of episode.topicIds) {
      addMissingReference(issues, {
        entityId: episode.id,
        field: "Episode.topicIds",
        targetType: "Topic",
        targetId: topicId,
        exists: topicIds.has(topicId),
      });
    }
  }

  for (const work of catalog.works) {
    for (const topicId of work.topicIds) {
      addMissingReference(issues, {
        entityId: work.id,
        field: "Work.topicIds",
        targetType: "Topic",
        targetId: topicId,
        exists: topicIds.has(topicId),
      });
    }
    const hasPublishableEvidence = catalog.recommendationEvidence.some(
      (evidence) =>
        evidence.workId === work.id && canPublishRecommendation(evidence),
    );
    if (work.publicationStatus === "public" && !hasPublishableEvidence) {
      issues.push({
        code: "public_work_without_evidence",
        entityId: work.id,
        message: "Public Work requires publishable recommendation evidence",
      });
    }
  }

  return issues.toSorted((left, right) => {
    const priorityDifference =
      ISSUE_PRIORITY[left.code] - ISSUE_PRIORITY[right.code];
    if (priorityDifference !== 0) return priorityDifference;
    const entityDifference = compareText(left.entityId, right.entityId);
    if (entityDifference !== 0) return entityDifference;
    return compareText(left.message, right.message);
  });
}
